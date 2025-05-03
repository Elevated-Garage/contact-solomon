// === server.js ===
const express = require('express');
const multer = require('multer');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const { generateSummaryPDF } = require('./utils/pdfBuilder');
const intakeExtractor = require('./ai/intakeExtractor');
const chatResponder = require('./ai/chatResponder');
const doneChecker = require('./ai/doneChecker');
const { generateSessionId } = require('./utils/pdfBuilder');

const app = express();
const port = process.env.PORT || 10000;

app.use(express.json());
app.use(cors());
app.use(express.static('public'));

const userConversations = {};
const userUploadedPhotos = {};
const userIntakeOverrides = {};

const storage = multer.memoryStorage();
const upload = multer({ storage });

// === Upload route ===
app.post('/upload-photos', upload.array('photos'), (req, res) => {
  const sessionId = req.headers['x-session-id'];
  if (!userUploadedPhotos[sessionId]) userUploadedPhotos[sessionId] = [];
  req.files.forEach(file => userUploadedPhotos[sessionId].push(file));
  res.status(200).json({ success: true });
});

// === Skip photo upload route ===
app.post("/skip-photo-upload", (req, res) => {
  const sessionId = req.headers["x-session-id"];
  if (!sessionId) return res.status(400).send("Missing session ID");
  if (!userIntakeOverrides[sessionId]) userIntakeOverrides[sessionId] = {};
  userIntakeOverrides[sessionId].garage_photo_upload = "Skipped";
  res.status(200).send({ message: "Photo upload skipped." });
});

// === Main AI route ===
app.post('/message', async (req, res) => {
  let sessionId = req.headers['x-session-id'] || generateSessionId();
  const { message } = req.body;

  if (!message || typeof message !== 'string' || message.trim() === '') {
    return res.json({ reply: "Please type a message before sending." });
  }

  if (!userConversations[sessionId]) userConversations[sessionId] = [];
  userConversations[sessionId].push({ role: 'user', content: message });
  if (!userIntakeOverrides[sessionId]) userIntakeOverrides[sessionId] = {};

  // 🧠 Run intake field extractor
  await intakeExtractor(sessionId, message, userIntakeOverrides);

  // 💬 Generate chat reply
  const assistantReply = await chatResponder(sessionId, userConversations);
  userConversations[sessionId].push({ role: 'assistant', content: assistantReply });

  // ✅ Check completion
  const done = await doneChecker(sessionId, userIntakeOverrides);

  res.status(200).json({ reply: assistantReply, done, sessionId });
});

// === Start server ===
app.listen(port, () => {
  console.log(`✅ Contact Solomon backend running on port ${port}`);
});
