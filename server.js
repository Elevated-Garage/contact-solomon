// ==== Imports ====
const express = require('express');
const multer = require('multer');
const upload = multer();
const { Storage } = require('@google-cloud/storage');
const { google } = require('googleapis');
const cors = require('cors');
const bodyParser = require('body-parser');
const PDFDocument = require('pdfkit');
const crypto = require('crypto');
const app = express();
const port = process.env.PORT || 10000;
require('dotenv').config();

// ==== Session-Safe Memory Stores ====
const userConversations = {}; // { sessionId: [ { role, content }, ... ] }
const userUploadedPhotos = {}; // { sessionId: [file1, file2, ...] }

// ==== Middleware ====
app.use(cors());
app.use(bodyParser.json());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true }));

// ==== Google Drive Setup ====
const storage = new Storage({
  projectId: process.env.GCP_PROJECT_ID,
  keyFilename: process.env.GCP_KEY_FILE,
});

const drive = google.drive({
  version: 'v3',
  auth: new google.auth.GoogleAuth({
    keyFile: process.env.GCP_KEY_FILE,
    scopes: ['https://www.googleapis.com/auth/drive'],
  }),
});

// ==== Priming Prompt ====
const primingPrompt = `
You are Solomon, a professional and friendly garage design assistant for Elevated Garage that respects user answers.
If the user uploads a photo, thank them and let them know the Elevated Garage team will review it. Do NOT say you cannot view images. Just acknowledge the upload and continue.
(etc... full priming stays here)
`.trim();

// ==== Extraction Prompt ====
const extractionPrompt = `
You are a form analysis tool working behind the scenes at Elevated Garage.
You are NOT a chatbot. Do NOT greet the user or respond conversationally.
(Return structured JSON output)
`.trim();

// ==== Helper Functions ====
function generateSessionId() {
  return Math.random().toString(36).substring(2, 15);
}

// ==== Routes ====

// === POST /message ===
app.post('/message', async (req, res) => {
  try {
    const userMessage = req.body.message;
    const sessionId = req.headers['x-session-id'] || generateSessionId();

    if (!userConversations[sessionId]) {
      userConversations[sessionId] = [{ role: 'system', content: primingPrompt }];
    }
    userConversations[sessionId].push({ role: 'user', content: userMessage });

    const messages = userConversations[sessionId];

    const completion = await openai.createChatCompletion({
      model: 'gpt-4',
      messages,
    });

    const assistantMessage = completion.data.choices[0].message.content;

    userConversations[sessionId].push({ role: 'assistant', content: assistantMessage });

    res.status(200).json({
      reply: assistantMessage,
      done: false,
    });
  } catch (error) {
    console.error('Error in /message:', error);
    res.status(500).send('Internal Server Error');
  }
});

// === POST /upload-photos ===
app.post('/upload-photos', upload.array('photos'), (req, res) => {
  try {
    const sessionId = req.headers['x-session-id'] || generateSessionId();
    if (!userUploadedPhotos[sessionId]) {
      userUploadedPhotos[sessionId] = [];
    }
    userUploadedPhotos[sessionId].push(...req.files);
    res.status(200).json({ success: true });
  } catch (error) {
    console.error('Error uploading photos:', error);
    res.status(500).send('Internal Server Error');
  }
});

// === POST /submit-final-intake ===
app.post('/submit-final-intake', async (req, res) => {
  try {
    const sessionId = req.headers['x-session-id'];
    const conversationHistory = userConversations[sessionId] || [];
    const uploadedPhotos = userUploadedPhotos[sessionId] || [];

    if (conversationHistory.length === 0) {
      throw new Error('No conversation history found for session.');
    }

    // Build intake summary from conversation
    const doc = new PDFDocument();
    let buffers = [];

    doc.on('data', buffers.push.bind(buffers));
    doc.on('end', async () => {
      const pdfBuffer = Buffer.concat(buffers);

      // Upload PDF to Google Drive
      const fileName = `Garage_Intake_Summary_${Date.now()}.pdf`;
      const fileMetadata = {
        name: fileName,
        parents: [process.env.GOOGLE_DRIVE_FOLDER_ID],
      };

      const media = {
        mimeType: 'application/pdf',
        body: pdfBuffer,
      };

      await drive.files.create({
        resource: fileMetadata,
        media: media,
        fields: 'id',
      });

      console.log('✅ Final intake summary uploaded.');

      res.status(200).send('Final intake submission complete.');
    });

    doc.fontSize(20).text('Garage Project Intake Summary', { align: 'center' });
    doc.moveDown();

    conversationHistory.forEach((message) => {
      doc.fontSize(12).text(`${message.role.toUpperCase()}: ${message.content}`);
      doc.moveDown(0.5);
    });

    if (uploadedPhotos.length > 0) {
      doc.addPage();
      doc.fontSize(16).text('Uploaded Photos:', { underline: true });
      uploadedPhotos.forEach((file, index) => {
        doc.fontSize(12).text(`Photo ${index + 1}: [uploaded separately]`);
      });
    }

    doc.end();

  } catch (error) {
    console.error('Error processing final intake submission:', error);
    res.status(500).send('Internal Server Error');
  }
});

// ==== Start Server ====
app.listen(port, () => {
  console.log(`✅ Contact Solomon backend running on port ${port}`);
});


app.listen(port, () => {
  console.log(`✅ Contact Solomon backend running on port ${port}`);
});
