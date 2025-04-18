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
  try {
    const { tokens } = await oauth2Client.getToken(req.query.code);
    oauth2Client.setCredentials(tokens);
    fs.writeFileSync('token.json', JSON.stringify(tokens, null, 2));
    res.send("✅ Authorization successful! You may close this window.");
  } catch (err) {
    console.error('❌ Auth callback error:', err.message);
    res.status(500).send('OAuth Error');
  }
});

const upload = multer({ dest: 'uploads/' });

app.post('/submit', upload.single('photo'), async (req, res) => {
  console.log('📥 /submit hit');

  try {
    const responses = JSON.parse(req.body.responses);
    console.log("✅ Parsed responses:", responses);

    const nameStep = responses.find(r => r.step.includes('full name'));
    const clientName = nameStep ? nameStep.answer : "Unknown";
    const timestamp = new Date().toLocaleDateString('en-US');

    const folderName = `${clientName} ${timestamp}`;
    const drive = google.drive({ version: 'v3', auth: oauth2Client });

    const folder = await drive.files.create({
      requestBody: {
        name: folderName,
        mimeType: 'application/vnd.google-apps.folder'
      },
      fields: 'id'
    });

    const formattedText = responses.map(r => `${r.step}: ${r.answer}`).join('\n');
    const fileMetadata = {
      name: `${clientName} Submission ${timestamp}.txt`,
      parents: [folder.data.id]
    };
    const media = {
      mimeType: 'text/plain',
      body: Buffer.from(formattedText, 'utf-8')
    };
    await drive.files.create({ requestBody: fileMetadata, media });

    if (req.file) {
      const photoMetadata = {
        name: req.file.originalname,
        parents: [folder.data.id]
      };
      await drive.files.create({
        requestBody: photoMetadata,
        media: {
          mimeType: req.file.mimetype,
          body: fs.createReadStream(req.file.path)
        }
      });
      fs.unlinkSync(req.file.path);
    }

    const mailOptions = {
      from: process.env.LEAD_EMAIL_USER,
      to: 'nick@elevatedgarage.com',
      subject: '📥 New Garage Submission',
      text: formattedText
    };
    await transporter.sendMail(mailOptions);

    res.json({ success: true });
  } catch (err) {
    console.error("❌ Submit error:", err.message);
    res.status(500).json({ success: false, message: "Submit Failed" });
  }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`✅ Contact Solomon backend running on port ${PORT}`);
});



