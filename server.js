// server.js (Patched: Enforces photo confirmation before summary)

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
  userFlags,
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
app.post('/upload-photos', upload.array('photos'), async (req, res) => {
  const sessionId = req.headers['x-session-id'];
  ensureSession(sessionId);

  req.files.forEach(file => userUploadedPhotos[sessionId].push(file));
  userIntakeOverrides[sessionId].garage_photo_upload = "Uploaded";

  try {
    const pdfBuffer = await generateSummaryPDF(userIntakeOverrides[sessionId]);
    await uploadToDrive({
      fileName: `Garage-Quote-${sessionId}.pdf`,
      mimeType: 'application/pdf',
      buffer: pdfBuffer,
      folderId: process.env.GDRIVE_FOLDER_ID
    });

    console.log("[📸 Intake + Photo Complete] Summary PDF created and uploaded (upload path).");
    res.status(200).json({ success: true, show_summary: true });
  } catch (err) {
    console.error("❌ Failed to upload PDF after photo:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// === Skip photo upload route ===
app.post("/skip-photo-upload", async (req, res) => {
  const sessionId = req.headers["x-session-id"];
  if (!sessionId) return res.status(400).send("Missing session ID");
  ensureSession(sessionId);

  userIntakeOverrides[sessionId].garage_photo_upload = "Skipped";

  try {
    const pdfBuffer = await generateSummaryPDF(userIntakeOverrides[sessionId]);
    await uploadToDrive({
      fileName: `Garage-Quote-${sessionId}.pdf`,
      mimeType: 'application/pdf',
      buffer: pdfBuffer,
      folderId: process.env.GDRIVE_FOLDER_ID
    });

    console.log("[📸 Intake + Photo Complete] Summary PDF created and uploaded (skip path).");
    res.status(200).json({ message: "Photo upload skipped.", show_summary: true });
  } catch (err) {
    console.error("❌ Failed to upload PDF after skip:", err.message);
    res.status(500).json({ error: err.message });
  }
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

  const sessionMemory = {
    intakeData: userIntakeOverrides[sessionId],
    photoUploaded: userUploadedPhotos[sessionId]?.length > 0,
    photoRequested: userFlags[sessionId]?.photoRequested || false
  };

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
    } else {
      const chatResponse = await chatResponder(userConversations[sessionId], [], sessionMemory);
      assistantReply = chatResponse.message;

      // Sync memory
      if (sessionMemory.photoRequested) {
        if (!userFlags[sessionId]) userFlags[sessionId] = {};
        userFlags[sessionId].photoRequested = true;
      }

      // 👇 Photo enforcement BEFORE summary
      const photoFlag = userIntakeOverrides[sessionId]?.garage_photo_upload;
      const photosUploaded = userUploadedPhotos[sessionId]?.length > 0;

      if (!photosUploaded && (!photoFlag || photoFlag === '')) {
        responseData.triggerUpload = true;
        assistantReply = "📸 Before we finish, could you upload a photo of your garage or choose to skip it?";
      } else {
        console.log("[✅ Intake + Photo Complete] Submitting final summary...");
        await generateSummaryPDF(userIntakeOverrides[sessionId], sessionId);
        responseData.show_summary = true;
      }
    }
  } else {
    const chatResponse = await chatResponder(userConversations[sessionId], [], sessionMemory);
    assistantReply = chatResponse.message;

    if (sessionMemory.photoRequested) {
      if (!userFlags[sessionId]) userFlags[sessionId] = {};
      userFlags[sessionId].photoRequested = true;
    }

    if (chatResponse.signal === "triggerUploader") {
      responseData.triggerUpload = true;
    }
  }

  userConversations[sessionId].push({ role: 'assistant', content: assistantReply });
  responseData.reply = assistantReply;
  res.status(200).json(responseData);
});

// === Final Intake Submission Route ===
app.post('/submit-final-intake', async (req, res) => {
  const sessionId = req.headers['x-session-id'];
  if (!sessionId) return res.status(400).send("Missing session ID");
  ensureSession(sessionId);

  const intakeData = userIntakeOverrides[sessionId];
  const hasUploadedPhotos = userUploadedPhotos[sessionId]?.length > 0;
  const photoFlag = intakeData?.garage_photo_upload;

  // Ensure either upload or skip occurred before allowing summary
  if (!hasUploadedPhotos && (!photoFlag || photoFlag === '')) {
    return res.status(200).json({ triggerUpload: true });
  }

  console.log("[📸 Intake + Photo Complete] Submitting final summary (from confirmation route)...");
  await generateSummaryPDF(intakeData, sessionId);
  return res.status(200).json({ show_summary: true });
});

// === Start server ===
app.listen(port, () => {
  console.log(`✅ Contact Solomon backend running on port ${port}`);
});
