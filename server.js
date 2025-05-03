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

  let extractedFields = {};
  let responseData = { sessionId };

  // 🧠 Use full conversation for extraction
  if (userConversations[sessionId].length > 1) {
    extractedFields = await intakeExtractor(userConversations[sessionId]);
    for (const key in extractedFields) {
      const value = extractedFields[key];
      if (value && value.trim() !== '') {
        userIntakeOverrides[sessionId][key] = value;
      }
    }
    console.log("[intakeExtractor] Smart-merged updated intake:", userIntakeOverrides[sessionId]);
  } else {
    console.log("[intakeExtractor] Skipped — waiting for user to give real input.");
  }

  const noNewFields = Object.values(extractedFields).every(val => !val || val.trim() === '');
  let assistantReply;

  // ✅ Only run doneChecker when no new fields were found
  if (noNewFields) {
    const { done, missing } = await doneChecker(userIntakeOverrides[sessionId]);

    if (!done && missing.length > 0) {
      assistantReply = `Thanks! I still need a few more details to complete the intake: ${missing.join(", ")}. Could you share those?`;
    } else {
      const photoFlag = userIntakeOverrides[sessionId].garage_photo_upload;
      const photosUploaded = userUploadedPhotos[sessionId]?.length > 0;

      console.log("[Photo Check] photoUploaded:", photosUploaded);
      console.log("[Photo Check] garage_photo_upload:", photoFlag);

      if (!photosUploaded && (!photoFlag || photoFlag === '')) {
        responseData.open_upload = true;
        assistantReply = "Awesome! Could you upload a photo of your garage so we can complete your project profile?";
      } else {
        console.log("[✅ Intake + Photo Complete] Submitting final summary...");
        await generateSummaryPDF(userIntakeOverrides[sessionId], sessionId);
        responseData.show_summary = true;
        assistantReply = "All set! Here's a summary of your project.";
      }
    }
  } else {
    assistantReply = await chatResponder(userConversations[sessionId]);
  }

  userConversations[sessionId].push({ role: 'assistant', content: assistantReply });
  responseData.reply = assistantReply;
  res.status(200).json(responseData);
});

// === Start server ===
app.listen(port, () => {
  console.log(`✅ Contact Solomon backend running on port ${port}`);
});
