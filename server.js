const express = require('express');
const multer = require('multer');
const OpenAI = require('openai');
const { v4: uuidv4 } = require('uuid');
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');
require('dotenv').config();

async function generateSummaryPDF(data) {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage();
  const { width, height } = page.getSize();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontSize = 12;
  let y = height - 50;

  const drawLine = (label, value) => {
    page.drawText(`${label}: ${value || 'N/A'}`, {
      x: 50,
      y,
      size: fontSize,
      font,
      color: rgb(0, 0, 0)
    });
    y -= 20;
  };

  drawLine('Full Name', data.full_name);
  drawLine('Email', data.email);
  drawLine('Phone', data.phone);
  drawLine('Garage Goals', data.garage_goals);
  drawLine('Square Footage', data.square_footage);
  drawLine('Must-Have Features', data.must_have_features);
  drawLine('Budget', data.budget);
  drawLine('Preferred Start Date', data.start_date);
  drawLine('Final Notes', data.final_notes);

  const pdfBytes = await pdfDoc.save();
  return Buffer.from(pdfBytes);
}


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

const app = express();
const port = process.env.PORT || 10000;

app.use(express.json());
app.use(express.static('public'));

const userConversations = {};
const userUploadedPhotos = {};
const userIntakeOverrides = {};

// === Correct OpenAI setup ===
const ENABLE_AI_DONE_CHECK = true;
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
}); // closes /message

app.post("/skip-photo-upload", (req, res) => {
  const sessionId = req.headers["x-session-id"];
  if (!sessionId) return res.status(400).send("Missing session ID");

  if (!userIntakeOverrides[sessionId]) userIntakeOverrides[sessionId] = {};
  userIntakeOverrides[sessionId].garage_photo_upload = "Skipped";

  res.status(200).send({ message: "Photo upload skipped." });
});

// == /message route ==
app.post('/message', async (req, res) => {
  let sessionId = req.headers['x-session-id'] || generateSessionId();
  console.log("🧭 Session ID:", sessionId);

  const { message } = req.body;

  if (!message || typeof message !== 'string' || message.trim() === '') {
    return res.json({ reply: "Please type a message before sending." });
  }

  if (!userConversations[sessionId]) {
    userConversations[sessionId] = [];
  }

  userConversations[sessionId].push({ role: 'user', content: message });

  
// 👇 Add this inside your /message route, right after userConversations[sessionId].push(...)
if (!(sessionId in userIntakeOverrides)) {
  userIntakeOverrides[sessionId] = {};
}

const isJustSayingHello = /solomon.*(help|design|garage|start|hi|hello|there)/i.test(message);

if (isJustSayingHello) {
  console.log("🧘 Skipping field extraction: initial greeting or assistant callout.");
} else {
  const intakeExtractionPrompt = extractionPrompt.replace("{{message}}", message);

  try {
    const extractionCompletion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        { role: "system", content: "You are a structured field extractor." },
        { role: "user", content: intakeExtractionPrompt }
      ],
      temperature: 0
    });

    const extracted = JSON.parse(extractionCompletion.choices[0].message.content);
    const fields = [
      "full_name",
      "email",
      "phone",
      "garage_goals",
      "square_footage",
      "must_have_features",
      "budget",
      "start_date",
      "final_notes"
    ];

    console.log("📂 BEFORE merge:", JSON.stringify(userIntakeOverrides[sessionId], null, 2));
    
  for (const field of fields) {
  if (
    extracted[field] &&
    (!userIntakeOverrides[sessionId][field] || userIntakeOverrides[sessionId][field] === "")
  ) {
    userIntakeOverrides[sessionId][field] = extracted[field];
  }
}

    console.log("💾 AFTER merge:", JSON.stringify(userIntakeOverrides[sessionId], null, 2));

    console.log("📦 GPT Extracted Fields:", extracted);
    console.log("💾 Full Overrides Snapshot:", JSON.stringify(userIntakeOverrides[sessionId], null, 2));
  } catch (err) {
    console.warn("⚠️ GPT intake extraction failed:", err.message);
  }
}


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
      // ✅ Field completion logic — tells the AI if all required data has been captured
const requiredFields = [
  "full_name", "email", "phone", "garage_goals", "square_footage",
  "must_have_features", "budget", "start_date", "final_notes"
];

const isFieldComplete = requiredFields.every(field =>
  userIntakeOverrides[sessionId]?.[field] &&
  userIntakeOverrides[sessionId][field].trim() !== ""
);

let isAIDone = false;

if (ENABLE_AI_DONE_CHECK && !isFieldComplete) {
  try {
    const doneCheck = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        {
          role: "system",
          content: "You are a completion checker. Based on this chat history, respond ONLY with JSON: {\"done\": true} or {\"done\": false}."
        },
        ...conversationHistory
      ],
      temperature: 0
    });

    const parsed = JSON.parse(doneCheck.choices[0].message.content);
    isAIDone = parsed.done === true;
  } catch (err) {
    console.warn("⚠️ GPT done-check failed:", err.message);
  }
}

const done = ENABLE_AI_DONE_CHECK ? isAIDone || isFieldComplete : isFieldComplete;

res.status(200).json({
  reply: assistantReply,
  done,
  sessionId
});



// == /submit-final-intake route ==
app.post('/submit-final-intake', async (req, res) => {
  const sessionId = req.headers['x-session-id'];
  const conversationHistory = userConversations[sessionId] || [];
  const uploadedPhotos = userUploadedPhotos[sessionId] || [];

  try {
    const intakeData = await extractIntakeData(conversationHistory);
    const overrides = userIntakeOverrides?.[sessionId] || {};
    const mergedData = { ...overrides, ...intakeData };
    const hasRealData = Object.keys(mergedData).length > 0;

    const hasUploadedPhotos = uploadedPhotos.length > 0;

    if (hasRealData || hasUploadedPhotos) {
const pdfBuffer = await generateSummaryPDF(mergedData);

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
  ...mergedData,
  success: true,
  reply: "✅ Thank you for submitting your project! Our team will review everything and reach out to you shortly.",
  done: true
});

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

app.post("/update-intake", (req, res) => {
  const sessionId = req.headers["x-session-id"];
  const { field, value } = req.body;

  if (!sessionId || !field || typeof value !== "string") {
    return res.status(400).json({ error: "Missing required data." });
  }

  if (!(sessionId in userIntakeOverrides)) {
    userIntakeOverrides[sessionId] = {};
  }

  userIntakeOverrides[sessionId][field] = value;
  res.status(200).json({ success: true });
}); // 👈 you were missing this closing parenthesis!
app.listen(port, () => {
  console.log(`✅ Contact Solomon backend running on port ${port}`);
  })
};
});
