const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
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

  // 🧠 Run intake extractor ONLY after first round
if (userConversations[sessionId].length > 1) {
  const extractedFields = await intakeExtractor(message);
  Object.assign(userIntakeOverrides[sessionId], extractedFields);

  console.log("[intakeExtractor] Updated intake data:", userIntakeOverrides[sessionId]);
} else {
  console.log("[intakeExtractor] Skipped — waiting for user to give real input.");
}


  // 💬 Generate chat reply
  const assistantReply = await chatResponder(userConversations[sessionId]);
  userConversations[sessionId].push({ role: 'assistant', content: assistantReply });

  const responseData = {
    reply: assistantReply,
    sessionId,
  };

  // ✅ Check completion
  const isDone = await doneChecker(userIntakeOverrides[sessionId]);

  if (isDone) {
    console.log("[✅ Intake Complete] Submitting final summary...");
    await generateSummaryPDF(userIntakeOverrides[sessionId], sessionId);
    responseData.show_summary = true;

    if (!userIntakeOverrides[sessionId].photoUploaded && !userIntakeOverrides[sessionId].garage_photo_upload) {
      responseData.open_upload = true;
    }
  }

  res.status(200).json(responseData);
});

// === Start server ===
app.listen(port, () => {
  console.log(`✅ Contact Solomon backend running on port ${port}`);
});
