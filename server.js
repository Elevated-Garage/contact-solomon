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
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.LEAD_EMAIL_USER,
    pass: process.env.LEAD_EMAIL_PASS
  }
});


// === Intake Summary Submission ===
// Once the conversation reaches a natural conclusion and all required fields are answered,
// this server will:
// 1. Format the user's responses into a structured summary
// 2. Email the summary to nick@elevatedgarage.com using nodemailer
// 3. Upload the summary (and any attached photos) to Google Drive using your OAuth token
//
// This logic will be handled in the /submit route (or triggered from /message when intake is complete).

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
let photoUploaded = false;

app.post('/message', async (req, res) => {
  const userMessage = req.body.message;
  conversationHistory.push({ role: 'user', content: userMessage });

  try {
    

    const completion = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [
        { role: 'system', content: `You are Solomon, a professional and friendly garage design assistant for Elevated Garage that respects user answers.

If the user uploads a photo, thank them and let them know the Elevated Garage team will review it. Do NOT say you cannot view images. Just acknowledge the upload and continue.

If the user skips the upload, say that's okay and move on normally.

Start the conversation warmly. Your first priority is to get contact information early in the conversation — ideally right after your opening.

Ask for:
- Full Name
- Email Address
- Phone Number

Only after collecting that, begin learning about garage goals, layout, and features.

You must ensure the following key topics are covered before ending the conversation. Please treat "Garage Photo Upload" as the **final** required question, and only bring it up after all others have been answered.

1. Full Name  
2. Email Address  
3. Phone Number  
4. Garage Goals
5. Estimated Square Footage of Space
6. Must-Have Features  
7. Budget Range  
8. Preferred Start Date  
9. Final Notes
10. Garage Photo Upload 

Do not ask all of these at once.  
Weave them into the conversation naturally — one at a time — based on where the discussion is heading.  
Treat them as checkpoints, not a list.

When discussing budget:
- First, offer a general ballpark material-only price range only if the user asks
- Never suggest the budget is “more than enough” or “will definitely cover everything”
- Instead, acknowledge the budget as a helpful starting point and explain that total cost depends on materials, labor, and customization
- Then, continue with a next question like: “Do you have a preferred start date in mind?”

Never suggest DIY.

When all 9 topics have been addressed, wrap up the conversation with a natural closing message like:

"Thanks for sharing everything — this gives us a great foundation to begin planning your garage. We'll follow up with next steps soon!"

Optionally ask: “Is there anything else you'd like to add before we wrap up?”` },
        ...conversationHistory
      ],
    });

    const aiReply = completion.choices?.[0]?.message?.content || "⚠️ Sorry, I couldn’t generate a response.";
    conversationHistory.push({ role: 'assistant', content: aiReply });
    
  const lowerReply = aiReply.toLowerCase();
  const isPhotoPrompt = /photo|garage image|upload.*picture|garage pic|current space/i.test(aiReply);

  let responseData = { reply: aiReply, photo_request: isPhotoPrompt };


  const skipSummary = userMessage.toLowerCase().includes("uploaded a photo");



    if (!intakeSummarySent && hasAnsweredAllIntakeQuestions(conversationHistory) && photoUploaded) {
      await submitFinalIntakeSummary(conversationHistory);
      intakeSummarySent = true;
      return res.json({ ...responseData, show_summary: true });
    } else {
      return res.json(responseData);
    }


  } catch (err) {
    console.error('Error in /message:', err.message);

  const skipSummary = userMessage.toLowerCase().includes("uploaded a photo");

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

// === /submit route ===
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
    
    const expectedOrder = [
      "Full Name",
      "Email Address",
      "Phone Number",
      "Garage Goals",
      "Estimated Square Footage of Space",
      "Must-Have Features",
      "Budget Range",
      "Preferred Start Date",
      "Final Notes",
      "Garage Photo Upload"
    ];

    photoUploaded = req.file && req.file.path ? true : false;




const structuredSummary = expectedOrder.map(label => {
  if (label === "Garage Photo Upload") {
    return `${label}: ${photoUploaded ? "✅ Uploaded" : "❌ Not uploaded"}`;
  }

  
  if (label === "Preferred Start Date") {
    const preferred = responses.find(r => r.step === "Preferred Start Date");
    const answer = preferred?.answer || "";
    return `${label}: ${answer || "(Not provided)"}`;
  }
return `${label}: ${match ? match.answer : "(Not provided)"}`;
}).join('\n');




    const formattedText = structuredSummary;
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

    photoUploaded = true;
    if (req.file && req.file.path) {
      photoUploaded = true;
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
      to: 'elevatedgaragecda@gmail.com',
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

let intakeSummarySent = false;


function hasAnsweredAllIntakeQuestions(history) {
  
  const checklist = [
    "full name",
    "email",
    "phone",
    "garage goals",
    "Estimated Square Footage of Space",
    "must-have features",
    "budget",
    "start date",
    "final notes",
    "photo"
  ];

  const combined = history.map(entry => entry.content.toLowerCase()).join(" ");
  return checklist.every(item => combined.includes(item));
}


async function submitFinalIntakeSummary(conversationHistory) {
  const formattedText = conversationHistory
    .filter(m => m.role === 'user' || m.role === 'assistant')
    .map(m => `${m.role.toUpperCase()}: ${m.content}`)
  .join("\n\n");

  const timestamp = new Date().toISOString().split("T")[0];
  const filename = `Garage_Intake_Summary_${timestamp}.txt`;
  const buffer = Buffer.from(formattedText, "utf-8");

  // Email the summary
  await transporter.sendMail({
    from: process.env.LEAD_EMAIL_USER,
    to: "elevatedgaragecda@gmail.com",
    subject: "📥 New Garage Intake Submission",
    text: formattedText
  });

  // Upload to Drive
  const drive = google.drive({ version: "v3", auth: oauth2Client });
  const parentFolder = await getOrCreateFolder(drive, "Garage Submissions");
  await drive.files.create({
    requestBody: {
      name: filename,
      mimeType: "text/plain",
      parents: [parentFolder]
    },
    media: {
      mimeType: "text/plain",
      body: Readable.from(buffer)
    }
  });

  console.log("✅ Intake summary sent to email and Google Drive.");
}

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`✅ Contact Solomon backend running on port ${PORT}`);
});
