const express = require('express');
const multer = require('multer');
const OpenAI = require('openai');
const { v4: uuidv4 } = require('uuid');
const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');
require('dotenv').config();

// Setup dynamic variables
let solomonPrompt = fs.readFileSync(path.join(__dirname, 'prompts', 'solomon-prompt.txt'), 'utf8');
let extractionPrompt = fs.readFileSync(path.join(__dirname, 'prompts', 'extraction-prompt.txt'), 'utf8');

// Watch prompt files for changes
fs.watchFile(path.join(__dirname, 'prompts', 'solomon-prompt.txt'), (curr, prev) => {
  console.log("♻️ Reloading solomon-prompt.txt...");
  solomonPrompt = fs.readFileSync(path.join(__dirname, 'prompts', 'solomon-prompt.txt'), 'utf8');
});

fs.watchFile(path.join(__dirname, 'prompts', 'extraction-prompt.txt'), (curr, prev) => {
  console.log("♻️ Reloading extraction-prompt.txt...");
  extractionPrompt = fs.readFileSync(path.join(__dirname, 'prompts', 'extraction-prompt.txt'), 'utf8');
});


// Load external prompts
const solomonPrompt = fs.readFileSync(path.join(__dirname, 'prompts', 'solomon-prompt.txt'), 'utf8');
const extractionPrompt = fs.readFileSync(path.join(__dirname, 'prompts', 'extraction-prompt.txt'), 'utf8');


const app = express();
const port = process.env.PORT || 10000;

app.use(express.json());
app.use(express.static('public'));

const userConversations = {};
const userUploadedPhotos = {};

// === Correct OpenAI setup ===
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
}); // <<< this closing bracket was missing

// Google Drive setup
const auth = new google.auth.GoogleAuth({
  credentials: {
    client_email: process.env.GOOGLE_CLIENT_EMAIL,
    private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n')
  },
  scopes: ['https://www.googleapis.com/auth/drive.file']
});
const drive = google.drive({ version: 'v3', auth });


// == Priming ==

function generateSessionId() {
  return uuidv4();
}

const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// == /upload-photos route ==
app.post('/upload-photos', upload.array('photos'), (req, res) => {
  const sessionId = req.headers['x-session-id'];
  if (!userUploadedPhotos[sessionId]) {
    userUploadedPhotos[sessionId] = [];
  }
  req.files.forEach(file => userUploadedPhotos[sessionId].push(file));
  res.status(200).json({ success: true });
});

// == /message route ==
app.post('/message', async (req, res) => {
  let sessionId = req.headers['x-session-id'] || generateSessionId();
  const { message } = req.body;

  if (!message || typeof message !== 'string' || message.trim() === '') {
    return res.json({ reply: "Please type a message before sending." });
  }

  if (!userConversations[sessionId]) {
    userConversations[sessionId] = [];
  }

  userConversations[sessionId].push({ role: 'user', content: message });

  try {
    const conversationHistory = [
      { role: "system", content: solomonPrompt },
      ...(userConversations[sessionId] || [])
    ];

    const completion = await openai.chat.completions.create({
      model: "gpt-4",
      messages: conversationHistory,
      temperature: 0.7
    });

    if (completion && completion.choices && completion.choices.length > 0) {
      const assistantReply = completion.choices[0].message.content;
      userConversations[sessionId].push({ role: 'assistant', content: assistantReply });
      res.status(200).json({ reply: assistantReply, done: false, sessionId });
    } else {
      console.error("❌ OpenAI returned no choices.");
      res.status(500).json({ reply: "Sorry, I couldn't generate a response.", done: false, sessionId });
    }
  } catch (error) {
    console.error("❌ OpenAI Error:", error.response ? error.response.data : error.message);
    res.status(500).json({ reply: "Sorry, I had an issue responding.", done: false, sessionId });
  }
});

// == /submit-final-intake route ==
app.post('/submit-final-intake', async (req, res) => {
  const sessionId = req.headers['x-session-id'];
  const conversationHistory = userConversations[sessionId] || [];
  const uploadedPhotos = userUploadedPhotos[sessionId] || [];

  try {
    const intakeData = await extractIntakeData(conversationHistory);
    const overrides = userIntakeOverrides?.[sessionId] || {};
    const mergedData = { ...intakeData, ...overrides };
    const hasRealData = Object.keys(mergedData).length > 0;

    const hasUploadedPhotos = uploadedPhotos.length > 0;

    if (hasRealData || hasUploadedPhotos) {
      const footerText = "\u00a9 Elevated Garage - Built with Excellence";
      const pdfDoc = new PDFDocument({ autoFirstPage: false });
      const pdfBuffers = [];

      pdfDoc.on('data', chunk => pdfBuffers.push(chunk));
      pdfDoc.on('end', async () => {
        const pdfBuffer = Buffer.concat(pdfBuffers);

        await drive.files.create({
          requestBody: {
            name: `Garage_Project_Summary_${Date.now()}.pdf`,
            mimeType: 'application/pdf',
            parents: [process.env.GOOGLE_DRIVE_FOLDER_ID]
          },
          media: {
            mimeType: 'application/pdf',
            body: Buffer.from(pdfBuffer)
          }
        });
        
        res.status(200).json({
          success: true,
          reply: "✅ Thank you for submitting your project! Our team will review everything and reach out to you shortly.",
          summary: intakeData, // 📢 This is your clean structured data!
          done: true
        });
      });

      pdfDoc.addPage();
      const logoPath = path.join(__dirname, 'public', 'logo.png');
      if (fs.existsSync(logoPath)) {
        pdfDoc.image(logoPath, { fit: [150, 150], align: 'center' }).moveDown(1.5);
      }
      pdfDoc.fontSize(22).text('Garage Project Summary', { align: 'center' }).moveDown(2);

      pdfDoc.fontSize(14);
      pdfDoc.text(`Full Name: ${mergedData.full_name}`).moveDown(0.5);
      pdfDoc.text(`Email: ${mergedData.email}`).moveDown(0.5);
      pdfDoc.text(`Phone: ${mergedData.phone}`).moveDown(0.5);
      pdfDoc.text(`Garage Goals: ${mergedData.garage_goals}`).moveDown(0.5);
      pdfDoc.text(`Square Footage: ${mergedData.square_footage}`).moveDown(0.5);
      pdfDoc.text(`Must-Have Features: ${mergedData.must_have_features}`).moveDown(0.5);
      pdfDoc.text(`Budget: ${mergedData.budget}`).moveDown(0.5);
      pdfDoc.text(`Preferred Start Date: ${mergedData.start_date}`).moveDown(0.5);
      pdfDoc.text(`Final Notes: ${mergedData.final_notes}`).moveDown(0.5);
      pdfDoc.text(`Garage Photo Upload: ${mergedData.garage_photo_upload}`).moveDown(0.5);

      if (uploadedPhotos.length > 0) {
        for (const file of uploadedPhotos) {
          pdfDoc.addPage();
          pdfDoc.fontSize(16).text('Uploaded Garage Photo', { align: 'center' }).moveDown(1);
          const tempPath = path.join(__dirname, 'temp_' + Date.now() + '_' + file.originalname);
          fs.writeFileSync(tempPath, file.buffer);
          pdfDoc.image(tempPath, { fit: [450, 300], align: 'center', valign: 'center' });
          fs.unlinkSync(tempPath);
        }
      }

      const range = pdfDoc.bufferedPageRange();
      for (let i = range.start; i < range.start + range.count; i++) {
        pdfDoc.switchToPage(i);
        pdfDoc.fontSize(8).text(footerText, 50, 770, { align: 'center', width: 500 });
        pdfDoc.text(`Page ${i + 1} of ${range.count}`, 50, 785, { align: 'center', width: 500 });
      }

      pdfDoc.end();

    } else {
      console.log(`⚠️ [${sessionId}] No sufficient intake data or uploaded photos.`);
      res.status(200).json({ reply: "✅ Thank you for submitting your project! Our team will review everything and reach out to you shortly.", done: true });
    }
  } catch (error) {
    console.error("❌ Final intake processing error:", error);
    res.status(500).send("Server Error during final intake processing.");
  }
});

async function extractIntakeData(conversationHistory) {
  const transcript = conversationHistory
    .filter(entry => entry.role === "user" || entry.role === "assistant")
    .map(entry => `${entry.role}: ${entry.content}`)
    .join("\n");

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [
        { role: "system", content: extractionPrompt },
        { role: "user", content: transcript }
      ],
      temperature: 0
    });

    if (completion && completion.choices && completion.choices.length > 0) {
      return JSON.parse(completion.choices[0].message.content);
    } else {
      console.error("❌ Extraction failed: No choices returned.");
      return {};
    }
  } catch (error) {
    console.error("❌ Extraction error:", error.response ? error.response.data : error.message);
    return {};
  }
}
// == /update-intake route ==
const userIntakeOverrides = {};

app.post("/update-intake", (req, res) => {
  const sessionId = req.headers["x-session-id"];
  const { field, value } = req.body;

  if (!sessionId || !field || typeof value !== "string") {
    return res.status(400).json({ error: "Missing required data." });
  }

  if (!userIntakeOverrides[sessionId]) {
    userIntakeOverrides[sessionId] = {};
  }

  userIntakeOverrides[sessionId][field] = value;
  res.status(200).json({ success: true });
});

app.listen(port, () => {
  console.log(`✅ Contact Solomon backend running on port ${port}`);
});

// == END OF SERVER ==

