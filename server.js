const express = require('express');
const multer = require('multer');
const cors = require('cors');
require('dotenv').config();

const { generateSummaryPDF } = require('./utils/pdfBuilder');
const { generateSessionId } = require('./utils/sessions');
const intakeExtractor = require('./ai/intakeExtractor');
const chatResponder = require('./ai/chatResponder');
const doneChecker = require('./ai/doneChecker');
const {
  userConversations,
  userUploadedPhotos,
  userIntakeOverrides,
  userFlags,         // ✅ Add this line
  ensureSession
} = require('./utils/sessions');

const app = express();
const port = process.env.PORT || 10000;

app.use(express.json());
app.use(cors());
app.use(express.static('public'));

const storage = multer.memoryStorage();
const upload = multer({ storage });

// === Upload route ===
app.post('/upload-photos', upload.array('photos'), (req, res) => {
  const sessionId = req.headers['x-session-id'];
  ensureSession(sessionId);
  req.files.forEach(file => userUploadedPhotos[sessionId].push(file));
  userIntakeOverrides[sessionId].photoUploaded = true;
  res.status(200).json({ success: true });
});

// === Skip photo upload route ===
app.post("/skip-photo-upload", (req, res) => {
  const sessionId = req.headers["x-session-id"];
  if (!sessionId) return res.status(400).send("Missing session ID");
  ensureSession(sessionId);
  userIntakeOverrides[sessionId].garage_photo_upload = "Skipped";
  res.status(200).send({ message: "Photo upload skipped." });
});

// === Main AI route ===
app.post('/message', async (req, res) => {
  const sessionId = req.headers['x-session-id'] || generateSessionId();
  const { message } = req.body;
  ensureSession(sessionId);

  if (!message || typeof message !== 'string' || message.trim() === '') {
    return res.json({ reply: "Please type a message before sending." });
  }

  userConversations[sessionId].push({ role: 'user', content: message });

  // Extract new fields from the user's message
  const { fields } = await intakeExtractor(userConversations[sessionId]);

  // Merge extracted fields into memory
  for (const key in fields) {
    const value = fields[key];
    if (value && value.trim() !== '') {
      userIntakeOverrides[sessionId][key] = value;
    }
  }

  console.log("[intakeExtractor] Smart-merged updated intake:", userIntakeOverrides[sessionId]);

  let assistantReply;
  const responseData = { sessionId };

  // Shared memory object passed to chatResponder
  const sessionMemory = {
    intakeData: userIntakeOverrides[sessionId],
    photoUploaded: userUploadedPhotos[sessionId]?.length > 0,
    photoRequested: userFlags[sessionId]?.photoRequested || false
  };

  // Manual completeness check
  const requiredFields = [
    "full_name", "email", "phone",
    "garage_goals", "square_footage",
    "must_have_features", "budget",
    "start_date", "final_notes"
  ];
  const allFieldsPresent = requiredFields.every(key => {
    const val = userIntakeOverrides[sessionId][key];
    return val && val.trim().length > 0;
  });

  if (allFieldsPresent) {
    const { done, missing } = await doneChecker(userIntakeOverrides[sessionId]);

    if (!done && missing.length > 0) {
      const enhancedHistory = [
        ...userConversations[sessionId],
        { role: 'system', content: `missing_fields: ${JSON.stringify(missing)}` }
      ];

      const chatResponse = await chatResponder(enhancedHistory, missing, sessionMemory);
      assistantReply = chatResponse.message;

      // 🔁 Sync updated memory flag
     const chatResponse = await chatResponder(userConversations[sessionId], [], sessionMemory);
assistantReply = chatResponse.message;

// 🔁 Sync updated memory flag
if (sessionMemory.photoRequested) {
  if (!userFlags[sessionId]) userFlags[sessionId] = {};
  userFlags[sessionId].photoRequested = true;
}

// 👇 REPLACE THIS BLOCK 👇
if (chatResponse.signal === "triggerUploader") {
  responseData.triggerUpload = true;
} else {
  // This part gets replaced
}


// === Start server ===
app.listen(port, () => {
  console.log(`✅ Contact Solomon backend running on port ${port}`);
});
