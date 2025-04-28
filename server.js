// == FINAL SOLOMON SERVER.JS (Frankenstein Version) ==

const express = require('express');
const multer = require('multer');
const { Configuration, OpenAIApi } = require('openai');
const { v4: uuidv4 } = require('uuid');
const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 10000;

app.use(express.json());
app.use(express.static('public'));

const userConversations = {};
const userUploadedPhotos = {};

// OpenAI setup
const openai = new OpenAIApi(new Configuration({ apiKey: process.env.OPENAI_API_KEY }));

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
const solomonPrompt = [
  "You are Solomon, a professional and friendly garage design assistant for Elevated Garage that respects user answers.",
  "If the user uploads a photo, thank them and let them know the Elevated Garage team will review it. Do NOT say you cannot view images. Just acknowledge the upload and continue.",
  "If the user skips the upload, say that's okay and move on normally.",
  "Start the conversation warmly. Your first priority is to get contact information early in the conversation — ideally right after your opening.",
  "Ask for:",
  "- Full Name",
  "- Email Address",
  "- Phone Number",
  "Only after collecting that, begin learning about garage goals, layout, and features.",
  "You must ensure the following key topics are covered before ending the conversation. Please treat \"Garage Photo Upload\" as the **final** required question, and only bring it up after all others have been answered.",
  "1. Full Name",
  "2. Email Address",
  "3. Phone Number",
  "4. Garage Goals",
  "5. Estimated Square Footage of Space",
  "6. Must-Have Features",
  "7. Budget Range",
  "8. Preferred Start Date",
  "9. Final Notes",
  "10. Garage Photo Upload",
  "Do not ask all of these at once.",
  "Weave them into the conversation naturally — one at a time — based on where the discussion is heading.",
  "Treat them as checkpoints, not a list.",
  "When discussing budget:",
  "- First, offer a general ballpark material-only price range only if the user asks",
  "- Never suggest the budget is \"more than enough\" or \"will definitely cover everything\"",
  "- Instead, acknowledge the budget as a helpful starting point and explain that total cost depends on materials, labor, and customization",
  "- Then, continue with a next question like: “Do you have a preferred start date in mind?”",
  "Never suggest DIY.",
  "When all 9 topics have been addressed, wrap up the conversation with a natural closing message like:",
  "\"Thanks for sharing everything — this gives us a great foundation to begin planning your garage. We'll follow up with next steps soon!\""
].join("\n");

const extractionPrompt = [
  "You are a form analysis tool working behind the scenes at Elevated Garage.",
  "You are NOT a chatbot. Do NOT greet the user or respond conversationally.",
  "Your job is to extract key information from a transcript of a conversation between the user and Solomon, a conversational AI assistant.",
  "Return a structured JSON object containing these 10 fields:",
  "- full_name",
  "- email",
  "- phone",
  "- garage_goals",
  "- square_footage",
  "- must_have_features",
  "- budget",
  "- start_date",
  "- final_notes",
  "- garage_photo_upload",
  "Respond ONLY with a valid JSON object. No text before or after. No assistant tag. No markdown formatting.",
  "Use natural language understanding to infer vague answers (e.g., 'probably 400ish square feet').",
  "If the user skips or declines the garage photo upload, set the field 'garage_photo_upload' to 'skipped'.",
  "",
  "Here is the full conversation transcript:"
].join("\n");

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
    const hasRealData = intakeData && Object.keys(intakeData).length > 0;
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
          reply: "✅ Thank you for submitting your project! Our team will review everything and reach out to you shortly.",
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
      pdfDoc.text(`Full Name: ${intakeData.full_name}`).moveDown(0.5);
      pdfDoc.text(`Email: ${intakeData.email}`).moveDown(0.5);
      pdfDoc.text(`Phone: ${intakeData.phone}`).moveDown(0.5);
      pdfDoc.text(`Garage Goals: ${intakeData.garage_goals}`).moveDown(0.5);
      pdfDoc.text(`Square Footage: ${intakeData.square_footage}`).moveDown(0.5);
      pdfDoc.text(`Must-Have Features: ${intakeData.must_have_features}`).moveDown(0.5);
      pdfDoc.text(`Budget: ${intakeData.budget}`).moveDown(0.5);
      pdfDoc.text(`Preferred Start Date: ${intakeData.start_date}`).moveDown(0.5);
      pdfDoc.text(`Final Notes: ${intakeData.final_notes}`).moveDown(0.5);
      pdfDoc.text(`Garage Photo Upload: ${intakeData.garage_photo_upload}`).moveDown(0.5);

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

app.listen(port, () => {
  console.log(`✅ Contact Solomon backend running on port ${port}`);
});

// == END OF SERVER ==

