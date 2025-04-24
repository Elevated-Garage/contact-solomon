
const fs = require('fs');
const PDFDocument = require('pdfkit');

function generateSummaryPDF(summaryText, outputPath) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument();
    const stream = fs.createWriteStream(outputPath);
    doc.pipe(stream);
    doc.font('Helvetica').fontSize(12).text(summaryText, {
      width: 500,
      align: 'left'
    });
    doc.end();
    stream.on('finish', () => resolve());
    stream.on('error', reject);
  });
}

async function createDriveFolder(name) {
  const res = await drive.files.create({
    resource: {
      name,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [process.env.DRIVE_PARENT_FOLDER_ID],
    },
    fields: 'id',
  });
  return res.data.id;
}



const fs = require('fs');

function generateSummaryPDF(summaryText, outputPath) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument();
    const stream = fs.createWriteStream(outputPath);
    doc.pipe(stream);
    doc.font('Helvetica').fontSize(12).text(summaryText, {
      width: 500,
      align: 'left'
    });
    doc.end();
    stream.on('finish', () => resolve());
    stream.on('error', reject);
  });
}



const fs = require('fs');

function generateSummaryPDF(summaryText, outputPath) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument();
    const stream = fs.createWriteStream(outputPath);
    doc.pipe(stream);
    doc.font('Helvetica').fontSize(12).text(summaryText, {
      width: 500,
      align: 'left'
    });
    doc.end();
    stream.on('finish', () => resolve());
    stream.on('error', reject);
  });
}



const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const OpenAI = require("openai");
const { google } = require("googleapis");
const fs = require("fs");
const path = require("path");
require("dotenv").config();

const app = express();
const port = process.env.PORT || Math.floor(10000 + Math.random() * 1000);

app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, "public")));

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const auth = new google.auth.GoogleAuth({
  keyFile: process.env.GOOGLE_CREDENTIALS,
  scopes: ["https://www.googleapis.com/auth/drive.file"]
});
const drive = google.drive({ version: "v3", auth });

const solomonPrompt = [
  "You are Solomon, a professional and friendly garage design assistant for Elevated Garage that respects user answers.",
  "If the user uploads a photo, thank them and let them know the Elevated Garage team will review it. Do NOT say you cannot view images. Just acknowledge the upload and continue.",
  "If the user skips the upload, say that's okay and move on normally.",
  "Start the conversation warmly. Your first priority is to get contact information early in the conversation — ideally right after your opening.",
  "Ask for:",
  "- Full Name",
  "- Email Address",
  "- Phone Number",
  "Only after collecting that, begin learning about garage goals, layout, and features.",
  "You must ensure the following key topics are covered before ending the conversation. Please treat \"Garage Photo Upload\" as the **final** required question, and only bring it up after all others have been answered.",
  "1. Full Name",
  "2. Email Address",
  "3. Phone Number",
  "4. Garage Goals",
  "5. Estimated Square Footage of Space",
  "6. Must-Have Features",
  "7. Budget Range",
  "8. Preferred Start Date",
  "9. Final Notes",
  "10. Garage Photo Upload",
  "Do not ask all of these at once.",
  "Weave them into the conversation naturally — one at a time — based on where the discussion is heading.",
  "Treat them as checkpoints, not a list.",
  "When discussing budget:",
  "- First, offer a general ballpark material-only price range only if the user asks",
  "- Never suggest the budget is “more than enough” or “will definitely cover everything”",
  "- Instead, acknowledge the budget as a helpful starting point and explain that total cost depends on materials, labor, and customization",
  "- Then, continue with a next question like: “Do you have a preferred start date in mind?”",
  "Never suggest DIY.",
  "When all 9 topics have been addressed, wrap up the conversation with a natural closing message like:",
  "\"Thanks for sharing everything — this gives us a great foundation to begin planning your garage. We'll follow up with next steps soon!\""
].join("\n") ;

const extractionPrompt = [
  "You are a form analysis tool working behind the scenes at Elevated Garage.",
  "You are NOT a chatbot. Do NOT greet the user or respond conversationally.",
  "Your job is to extract key information from a transcript of a conversation between the user and Solomon, a conversational AI assistant.",
  "Return a structured JSON object containing these 10 fields:",
  "- full_name",
  "- email",
  "- phone",
  "- garage_goals",
  "- square_footage",
  "- must_have_features",
  "- budget",
  "- start_date",
  "- final_notes",
  "- garage_photo_upload",
  "Respond ONLY with a valid JSON object. No text before or after. No assistant tag. No markdown formatting.",
  "Use natural language understanding to infer vague answers (e.g., 'probably 400ish square feet').",
  "If the user skips or declines the garage photo upload, set the field 'garage_photo_upload' to 'skipped'.",
  "",
  "Here is the full conversation transcript:"
].join("\n") ;

const extractIntakeData = async (history) => {
  const transcript = history
    .filter(m => m.role === "user" || m.role === "assistant")
    .map(m => `${m.role}: ${m.content}`)
    .join("\n") ;

  const completion = await openai.chat.completions.create({
    model: "gpt-4",
    messages: [
      { role: "system", content: extractionPrompt },
      { role: "user", content: transcript }
    ],
    temperature: 0
  });

  let raw = completion.choices[0].message.content.trim();
  const firstBrace = raw.indexOf("{");
  if (firstBrace > 0) raw = raw.slice(firstBrace);

  try {
    return JSON.parse(raw);
  } catch (err) {
    console.error("❌ Failed to parse extracted data:", err.message);
    console.error("Returned content:", raw);
    return {};
  }
};

app.post("/message", async (req, res) => {
  let imageSection = '';
  const { conversationHistory, trigger_summary } = req.body;

  if (!Array.isArray(conversationHistory)) {
    return res.status(400).json({ error: "Invalid history format." });
  }

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [
        { role: "system", content: solomonPrompt + imageSection },
        ...conversationHistory
      ]
    });

    const aiReply = completion.choices[0].message.content;
    // Smart detection of photo skip or upload based on last user message
    const lastUserMsg = [...conversationHistory].reverse().find(m => m.role === "user")?.content?.toLowerCase() || "";

    const skipPhrases = [
      "no thank you", "skip the photo", "skip photo upload", "i don’t have a picture",
      "not right now", "can i skip", "no photo", "i’d rather not", "i’ll send it later"
    ];
    const uploadPhrases = [
      "photo uploaded", "uploaded a photo", "just uploaded", "attached the photo", "sent a picture"
    ];

    const shouldTriggerSmart = skipPhrases.some(p => lastUserMsg.includes(p)) ||
                               uploadPhrases.some(p => lastUserMsg.includes(p));

    if (shouldTriggerSmart) {
      console.log("🧠 Smart phrase detected:", lastUserMsg);
    }


    let done = false;

    if (trigger_summary === true || shouldTriggerSmart) {
      const extracted = await extractIntakeData(conversationHistory);
      done = extracted && Object.values(extracted).every(v => v && v.length > 0);

      if (done) {
        
        
        if (Array.isArray(req.body.images) && req.body.images.length > 0) {
          imageSection = '\n\nUploaded Images:\n' + req.body.images.map((img, i) => `Image ${i + 1}: [base64]`).join('\n');
        }

        const summary = Object.entries(extracted)
          .map(([k, v]) => `${k.replace(/_/g, " ")}: ${v}`)
          .join("\n") ;
        const fileName = `Garage-Intake-${new Date().toISOString().replace(/[:.]/g, "-")}.txt`;
        const filePath = path.join(__dirname, fileName);
        fs.writeFileSync(filePath, summary);

        try {
          const upload = await drive.files.create({
            requestBody: {
              name: fileName,
              mimeType: "text/plain",
              parents: [process.env.GOOGLE_DRIVE_FOLDER_ID]
            },
            media: {
              mimeType: "text/plain",
              body: fs.createReadStream(filePath)
            }
          });
          fs.unlinkSync(filePath);
          console.log("✅ Intake summary uploaded:", upload.data.id);
        console.log("📨 Intake summary triggered by AI — data complete and uploaded.");
        } catch (uploadErr) {
          console.error("❌ Upload failed:", uploadErr.message);
        }
      }
    }

    // Handle image uploads (if any)
    if (Array.isArray(req.body.images)) {
      for (let i = 0; i < req.body.images.length; i++) {
        const base64Data = req.body.images[i].split(";base64,").pop();
        const fileExtension = req.body.images[i].includes("image/png") ? "png" : "jpg";
        const fileName = `Garage-Photo-${new Date().toISOString().replace(/[:.]/g, "-")}-${i + 1}.${fileExtension}`;
        const filePath = path.join(__dirname, fileName);
        fs.writeFileSync(filePath, base64Data, { encoding: "base64" });

        try {
          const upload = await drive.files.create({
            requestBody: {
              name: fileName,
              mimeType: `image/${fileExtension}`,
              parents: [process.env.GOOGLE_DRIVE_FOLDER_ID]
            },
            media: {
              mimeType: `image/${fileExtension}`,
              body: fs.createReadStream(filePath)
            }
          });
          fs.unlinkSync(filePath);
          console.log(`📸 Uploaded image ${i + 1} to Drive:`, upload.data.id);
        } catch (uploadErr) {
          console.error(`❌ Failed to upload image ${i + 1}:`, uploadErr.message);
        }
      }
    }

res.json({ reply: aiReply, done });
  } catch (err) {
    console.error("❌ Chat error:", err.message);
    res.json({ reply: "Sorry, I hit an issue. Try again?", done: false });
  }
});

app.listen(port, () => {
  console.log(`✅ Contact Solomon backend running on port ${port}`);
});

// Generate PDF and upload to same folder
const pdfPath = `./Garage Project Summary - ${timestamp}.pdf`;
await generateSummaryPDF(summaryText, pdfPath);

const pdfFileMetadata = {
  name: `Garage Project Summary - ${timestamp}.pdf`,
  parents: [folderId],
};
const pdfMedia = {
  mimeType: 'application/pdf',
  body: fs.createReadStream(pdfPath),
};
await drive.files.create({
  resource: pdfFileMetadata,
  media: pdfMedia,
  fields: 'id',
});
