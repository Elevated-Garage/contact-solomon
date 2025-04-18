const express = require('express');
const fs = require('fs');
const path = require('path');
const bodyParser = require('body-parser');
const nodemailer = require('nodemailer');
const { google } = require('googleapis');
const cors = require('cors');
const multer = require('multer');
const { Readable } = require('stream');
const OpenAI = require("openai");
require('dotenv').config();

const app = express();
app.use(cors());
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const upload = multer({ dest: 'uploads/' });

// === GOOGLE OAUTH SETUP ===
const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

if (fs.existsSync('token.json')) {
  try {
    const tokens = JSON.parse(fs.readFileSync('token.json', 'utf8'));
    oauth2Client.setCredentials(tokens);
    console.log("✅ Google Drive token loaded.");
  } catch (err) {
    console.error("❌ Failed to load token.json:", err.message);
  }
}

// === OPENAI SETUP ===
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

let conversationHistory = [];

app.post('/message', async (req, res) => {
  const userMessage = req.body.message;
  conversationHistory.push({ role: 'user', content: userMessage });

  try {
    // Image generation logic
    if (userMessage.toLowerCase().includes('generate') && userMessage.toLowerCase().includes('design')) {
      const dalleRes = await openai.images.generate({
  model: "dall-e-3",
        prompt: `garage design: ${userMessage}`,
        n: 1,
        size: '512x512'
      });
      const imageUrl = dalleRes.data[0].url;
      return res.json({ reply: "Here’s your generated design 👇", image: imageUrl });
    }

    const completion = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [
        { role: 'system', content: 'You are Solomon, a friendly, knowledgeable assistant helping users design their dream garage with Elevated Garage. Respond conversationally and help them brainstorm ideas.' },
        ...conversationHistory
      ],
    });

    const aiReply = completion.data.choices[0].message.content;
    conversationHistory.push({ role: 'assistant', content: aiReply });
    res.json({ reply: aiReply });
  } catch (err) {
    console.error('Error in /message:', err.message);
    res.status(500).json({ reply: 'Something went wrong. Please try again shortly.' });
  }
});

// === Helper: Google Drive folder setup ===
async function getOrCreateFolder(drive, folderName) {
  const query = `mimeType='application/vnd.google-apps.folder' and name='${folderName}' and trashed=false`;
  const res = await drive.files.list({ q: query });
  if (res.data.files.length > 0) return res.data.files[0].id;

  const newFolder = await drive.files.create({
    requestBody: {
      name: folderName,
      mimeType: 'application/vnd.google-apps.folder',
    }
  });
  return newFolder.data.id;
}

// === /submit route (unchanged from original) ===
app.post('/submit', upload.single('photo'), async (req, res) => {
  const drive = google.drive({ version: 'v3', auth: oauth2Client });

  try {
    console.log("📥 /submit hit");
    let responses = [];
    try {
      responses = JSON.parse(req.body.responses);
    } catch (err) {
      console.warn("⚠️ Failed to parse responses:", req.body.responses);
    }

    const nameStep = responses.find(r => r.step.toLowerCase().includes("full name"));
    const clientName = nameStep ? nameStep.answer.trim() : "Unknown";
    const timestamp = new Date().toISOString().split("T")[0];
    const submissionFolderName = `${clientName}_${timestamp}`;

    const mainFolderRes = await drive.files.list({
      q: "mimeType='application/vnd.google-apps.folder' and name='Garage Submissions' and trashed=false",
      fields: "files(id, name)"
    });
    let mainFolderId;
    if (mainFolderRes.data.files.length > 0) {
      mainFolderId = mainFolderRes.data.files[0].id;
    } else {
      const createdMain = await drive.files.create({
        requestBody: {
          name: "Garage Submissions",
          mimeType: "application/vnd.google-apps.folder",
        },
        fields: "id"
      });
      mainFolderId = createdMain.data.id;
    }

    const subFolderRes = await drive.files.create({
      requestBody: {
        name: submissionFolderName,
        mimeType: "application/vnd.google-apps.folder",
        parents: [mainFolderId]
      },
      fields: "id"
    });
    const subFolderId = subFolderRes.data.id;

    const filename = `${clientName} Submission ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}.txt`;
    const formattedText = responses.map(r => `${r.step}: ${r.answer}`).join('\n');
    const buffer = Buffer.from(formattedText, 'utf-8');

    await drive.files.create({
      requestBody: {
        name: filename,
        mimeType: 'text/plain',
        parents: [subFolderId]
      },
      media: {
        mimeType: 'text/plain',
        body: Readable.from(buffer),
      }
    });

    if (req.file && req.file.path) {
      const filePath = path.join(__dirname, req.file.path);
      if (fs.existsSync(filePath)) {
        await drive.files.create({
          requestBody: {
            name: req.file.originalname,
            mimeType: req.file.mimetype,
            parents: [subFolderId]
          },
          media: {
            mimeType: req.file.mimetype,
            body: fs.createReadStream(filePath),
          },
        });
        fs.unlinkSync(filePath);
      }
    }

    await transporter.sendMail({
      from: process.env.LEAD_EMAIL_USER,
      to: 'nick@elevatedgarage.com',
      subject: '📥 New Garage Submission',
      text: formattedText + '\n\nNote: Files were saved to Google Drive.'
    });

    res.json({ success: true });
  } catch (err) {
    console.error("❌ Submit error:", err.message);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// === Google OAuth endpoints ===
app.get('/auth', (req, res) => {
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: ['https://www.googleapis.com/auth/drive.file'],
  });
  res.redirect(authUrl);
});

app.get('/api/oauth2callback', async (req, res) => {
  const code = req.query.code;
  try {
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);
    fs.writeFileSync('token.json', JSON.stringify(tokens, null, 2));
    res.send("✅ Google Drive authorized. You can close this window.");
  } catch (err) {
    console.error("❌ Auth callback error:", err.message);
    res.status(500).send("Authorization failed.");
  }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`✅ Contact Solomon backend running on port ${PORT}`);
});

