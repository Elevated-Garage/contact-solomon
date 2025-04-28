// == START OF SERVER ==
const express = require('express');
const multer = require('multer');
const upload = multer();
const { google } = require('googleapis');
const cors = require('cors');
const bodyParser = require('body-parser');
const PDFDocument = require('pdfkit');
const OpenAI = require('openai');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 10000;

// == ENVIRONMENT VALIDATION ==
if (!process.env.OPENAI_API_KEY) throw new Error("❌ Missing OPENAI_API_KEY");
if (!process.env.GOOGLE_CREDENTIALS) throw new Error("❌ Missing GOOGLE_CREDENTIALS");
if (!process.env.GOOGLE_DRIVE_FOLDER_ID) throw new Error("❌ Missing GOOGLE_DRIVE_FOLDER_ID");

// == MEMORY STORE FOR USER SESSIONS ==
const userConversations = {}; // { sessionId: [ { role, content }, ... ] }
const userUploadedPhotos = {}; // { sessionId: [photo buffers] }

// == Google API Setup ==
const auth = new google.auth.GoogleAuth({
  keyFile: process.env.GOOGLE_CREDENTIALS,
  scopes: ["https://www.googleapis.com/auth/drive.file"]
});
const drive = google.drive({ version: "v3", auth });

// == OpenAI Setup ==
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

app.use(cors());
app.use(bodyParser.json());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true }));
// Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

// == Helper to generate random session ID ==
function generateSessionId() {
  return crypto.randomBytes(16).toString('hex');
}

// == Upload Photos Route ==
app.post('/upload-photos', upload.any(), async (req, res) => {
  const sessionId = req.headers['x-session-id'] || generateSessionId();
  console.log(`📸 [${sessionId}] Received ${req.files.length} photos.`);

  userUploadedPhotos[sessionId] = req.files || [];
  const uploadedImageLinks = [];

  for (const file of userUploadedPhotos[sessionId]) {
    const driveUploadResponse = await drive.files.create({
      requestBody: {
        name: file.originalname,
        mimeType: file.mimetype,
        parents: [process.env.GOOGLE_DRIVE_FOLDER_ID]
      },
      media: {
        mimeType: file.mimetype,
        body: Buffer.from(file.buffer)
      }
    });
    uploadedImageLinks.push(`https://drive.google.com/uc?id=${driveUploadResponse.data.id}`);
  }

  res.status(200).json({ message: 'Photos uploaded successfully.', links: uploadedImageLinks, sessionId });
});

// == Solomon Priming ==
const solomonPrompt = [ "You are Solomon, a professional and friendly garage design assistant for Elevated Garage that respects user answers.",
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
  "- Never suggest the budget is “more than enough” or “will definitely cover everything”",
  "- Instead, acknowledge the budget as a helpful starting point and explain that total cost depends on materials, labor, and customization",
  "- Then, continue with a next question like: “Do you have a preferred start date in mind?”",
  "Never suggest DIY.",
  "When all 9 topics have been addressed, wrap up the conversation with a natural closing message like:",
  "\"Thanks for sharing everything — this gives us a great foundation to begin planning your garage. We'll follow up with next steps soon!\""
].join("\n");

const extractIntakeData = async (conversationHistory) => {
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

  const transcript = conversationHistory
    .filter(entry => entry.role === "user" || entry.role === "assistant")
    .map(entry => `${entry.role}: ${entry.content}`)
    .join("\n");

  try {
   const completion = await openai.chat.completions.create({
  model: "gpt-4",
  messages: [
    { role: "system", content: solomonPrompt },
    { role: "user", content: userMessage }
  ]
});


    return JSON.parse(completion.data.choices[0].message.content);
  } catch (error) {
    console.error("❌ Failed to extract structured intake:", error.message);
    return {};
  }
};

// == AI MESSAGE HANDLER ==
app.post('/message', async (req, res) => {
  let sessionId = req.headers['x-session-id'];
  if (!sessionId) {
    sessionId = generateSessionId();
  }

  const { message } = req.body;

  if (!userConversations[sessionId]) {
    userConversations[sessionId] = [];
  }

  userConversations[sessionId].push({ role: 'user', content: message });

  try {
    const completion = await openai.createChatCompletion({
      model: "gpt-4",
      messages: [
        { role: "system", content: solomonPrompt },
        ...userConversations[sessionId]
      ],
      temperature: 0.7
    });

    const assistantReply = completion.data.choices[0].message.content;

    userConversations[sessionId].push({ role: 'assistant', content: assistantReply });

    console.log(`📨 [${sessionId}] Incoming message processed.`);

    res.status(200).json({
      reply: assistantReply,
      done: false,
      sessionId
    });

  } catch (err) {
    console.error(`❌ [${sessionId}] OpenAI error:`, err.message);
    res.status(500).json({
      reply: "Sorry, I had an issue responding. Could you try again?",
      done: false,
      sessionId
    });
  }
});
// == FINAL INTAKE HANDLER (SESSION SAFE) ==
app.post('/submit-final-intake', async (req, res) => {
  let sessionId = req.headers['x-session-id'];
  if (!sessionId) {
    sessionId = generateSessionId();
  }

  console.log(`✅ [${sessionId}] Final intake submission received.`);

 try {
  const conversationHistory = userConversations[sessionId] || [];
  const uploadedPhotos = userUploadedPhotos[sessionId] || [];

  const intakeData = await extractIntakeData(conversationHistory);

  const hasRealData = intakeData && Object.keys(intakeData).length > 0;
  const hasUploadedPhotos = uploadedPhotos.length > 0;

  if (hasRealData || hasUploadedPhotos) {
    console.log("🧠 Building final summary and PDF...");

    const footerText = "© Elevated Garage - Built with Excellence";
    const pdfDoc = new PDFDocument({ autoFirstPage: false });
    const pdfBuffers = [];

    pdfDoc.on('data', chunk => pdfBuffers.push(chunk));
    
    pdfDoc.on('end', async () => {
      try {
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

        console.log(`✅ [${sessionId}] Final branded summary PDF uploaded.`);
      } catch (error) {
        console.error(`❌ [${sessionId}] Upload failed:`, error);
      }
    });

    // Build the actual PDF
    pdfDoc.addPage();
    const logoPath = path.join(__dirname, 'public', 'logo.png');
    if (fs.existsSync(logoPath)) {
      pdfDoc.image(logoPath, { fit: [150, 150], align: 'center' }).moveDown(1.5);
    }
    pdfDoc.fontSize(22).text('Garage Project Summary', { align: 'center' }).moveDown(2);

    // Structured intake data
    pdfDoc.fontSize(14);
    pdfDoc.text(`Full Name: ${intakeData.full_name}`, { width: 500 }).moveDown(0.5);
    pdfDoc.text(`Email: ${intakeData.email}`, { width: 500 }).moveDown(0.5);
    pdfDoc.text(`Phone: ${intakeData.phone}`, { width: 500 }).moveDown(0.5);
    pdfDoc.text(`Garage Goals: ${intakeData.garage_goals}`, { width: 500 }).moveDown(0.5);
    pdfDoc.text(`Square Footage: ${intakeData.square_footage}`, { width: 500 }).moveDown(0.5);
    pdfDoc.text(`Must-Have Features: ${intakeData.must_have_features}`, { width: 500 }).moveDown(0.5);
    pdfDoc.text(`Budget: ${intakeData.budget}`, { width: 500 }).moveDown(0.5);
    pdfDoc.text(`Preferred Start Date: ${intakeData.start_date}`, { width: 500 }).moveDown(0.5);
    pdfDoc.text(`Final Notes: ${intakeData.final_notes}`, { width: 500 }).moveDown(0.5);
    pdfDoc.text(`Garage Photo Upload: ${intakeData.garage_photo_upload}`, { width: 500 }).moveDown(0.5);

    // Uploaded Photos
    if (uploadedPhotos.length > 0) {
      for (const file of uploadedPhotos) {
        pdfDoc.addPage();
        pdfDoc.fontSize(16).text('Uploaded Garage Photo', { align: 'center' }).moveDown(1);

        const tempPath = path.join(__dirname, 'temp_' + Date.now() + '_' + file.originalname);
        fs.writeFileSync(tempPath, file.buffer);

        pdfDoc.image(tempPath, {
          fit: [450, 300],
          align: 'center',
          valign: 'center'
        });

        fs.unlinkSync(tempPath);
      }
    }

    // Footer
    const range = pdfDoc.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i++) {
      pdfDoc.switchToPage(i);
      pdfDoc.fontSize(8)
        .text(footerText, 50, 770, { align: 'center', width: 500 });
      pdfDoc.text(`Page ${i + 1} of ${range.count}`, 50, 785, { align: 'center', width: 500 });
    }

    pdfDoc.end();

  } else {
    console.log(`⚠️ [${sessionId}] No sufficient intake data or uploaded photos.`);
    res.status(200).json({
      reply: "✅ Thank you for submitting your project! Our team will review everything and reach out to you shortly.",
      done: true
    });
  }

} catch (error) {
  console.error(`❌ [${sessionId}] Error during final intake processing:`, error);
  res.status(500).send("Server Error during final intake processing.");
}
});
// == Helper Function: Build Summary from Conversation (for backup) ==
function buildSummaryFromConversation(convo) {
  return convo.map(entry => `${entry.role.toUpperCase()}: ${entry.content}`).join("\n");
}

// == START SERVER ==
app.listen(port, () => {
  console.log(`✅ Contact Solomon backend running on port ${port}`);
});
// == END OF SERVER ==
