
const express = require('express');
const fs = require('fs');
const path = require('path');
const bodyParser = require('body-parser');
const nodemailer = require('nodemailer');
const OpenAI = require('openai');
const { google } = require('googleapis');
const cors = require('cors');
const multer = require('multer');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const transporter = nodemailer.createTransport({
  host: 'smtp.titan.email',
  port: 465,
  secure: true,
  auth: {
    user: process.env.LEAD_EMAIL_USER,
    pass: process.env.LEAD_EMAIL_PASS,
  }
});

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

app.get('/auth', (req, res) => {
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: ['https://www.googleapis.com/auth/drive.file'],
    redirect_uri: process.env.GOOGLE_REDIRECT_URI
  });
  res.redirect(authUrl);
});

app.get('/api/oauth2callback', async (req, res) => {
  const code = req.query.code;
  try {
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);
    fs.writeFileSync('token.json', JSON.stringify(tokens, null, 2));
    res.send("✅ Authorization successful! You may close this window.");
  } catch (err) {
    console.error('❌ Error retrieving access token:', err.message);
    res.status(500).send('Failed to authorize. Please try again.');
  }
});

const upload = multer({ dest: 'uploads/' });

app.post('/submit', upload.single('photo'), async (req, res) => {
  console.log("📥 /submit hit");

  try {
    const parsed = JSON.parse(req.body.responses);
    console.log("✅ Parsed responses:", parsed);

    const nameStep = parsed.find(r => r.step.includes("full name"));
    const clientName = nameStep ? nameStep.answer.trim() : "Unknown";
    const timestamp = new Date().toISOString().split("T")[0];
    const folderName = `${clientName} Submission ${timestamp}`;
    const filename = `${clientName} Submission ${timestamp}.txt`;

    const formattedText = parsed.map(r => `${r.step}: ${r.answer}`).join('\n');
    const buffer = Buffer.from(formattedText, 'utf-8');

    const drive = google.drive({ version: 'v3', auth: oauth2Client });

    const folderMetadata = {
      name: folderName,
      mimeType: 'application/vnd.google-apps.folder',
    };

    const folder = await drive.files.create({
      requestBody: folderMetadata,
      fields: 'id',
    });

    const folderId = folder.data.id;

    const formFile = await drive.files.create({
      requestBody: {
        name: filename,
        mimeType: 'text/plain',
        parents: [folderId]
      },
      media: {
        mimeType: 'text/plain',
        body: buffer
      }
    });

    let imageFile = null;
    if (req.file) {
      const filePath = path.join(__dirname, req.file.path);
      imageFile = await drive.files.create({
        requestBody: {
          name: req.file.originalname,
          mimeType: req.file.mimetype,
          parents: [folderId]
        },
        media: {
          mimeType: req.file.mimetype,
          body: fs.createReadStream(filePath)
        }
      });
      fs.unlinkSync(filePath);
    }

    const mailOptions = {
      from: process.env.LEAD_EMAIL_USER,
      to: 'nick@elevatedgarage.com',
      subject: '📥 New Garage Submission',
      text: formattedText
    };
    await transporter.sendMail(mailOptions);

    res.json({
      success: true,
      formFileId: formFile.data.id,
      photoFileId: imageFile?.data.id || null,
    });

  } catch (err) {
    console.error("❌ Submit error:", err.message);
    res.status(500).json({ success: false, message: "Upload failed." });
  }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`✅ Contact Solomon backend running on port ${PORT}`);
});



