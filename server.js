// Final Solomon Server with Branded PDF + Smart Prompts + Image Upload
const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const multer = require("multer");
const PDFDocument = require("pdfkit");
const { google } = require("googleapis");
const { OpenAI } = require("openai");
require("dotenv").config();

const app = express();
const port = process.env.PORT || 10000;
const upload = multer({ dest: "uploads/" });
app.use(cors());
app.use(bodyParser.json({ limit: "10mb" }));
app.use(bodyParser.urlencoded({ extended: true }));

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const auth = new google.auth.GoogleAuth({
  credentials: {
    client_email: process.env.GDRIVE_CLIENT_EMAIL,
    private_key: process.env.GDRIVE_PRIVATE_KEY.replace(/\\n/g, '\n'),
  },
  scopes: ["https://www.googleapis.com/auth/drive.file"]
});
const drive = google.drive({ version: "v3", auth });

let conversationHistory = [];
let uploadedImageData = null;

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
].join("\n");

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
].join("\n");

async function generateSummaryPDF(summaryJSON, imagePath, pdfPath) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument();
    const stream = fs.createWriteStream(pdfPath);
    doc.pipe(stream);

    const logoPath = path.join(__dirname, "assets", "logo.png");
    const watermarkPath = path.join(__dirname, "assets", "watermark.png");

    if (fs.existsSync(logoPath)) {
      doc.image(logoPath, 220, 60, { width: 160 });
    }

    doc.moveDown(4);
    doc.font("Helvetica-Bold").fontSize(16).text("ELEVATED GARAGE PROJECT SUMMARY", {
      align: "center",
      underline: true
    });
    doc.moveDown(2);

    if (fs.existsSync(watermarkPath)) {
      doc.image(watermarkPath, 150, 200, { width: 300, opacity: 0.1 });
    }

    for (const key in summaryJSON) {
      const label = key.replace(/_/g, " ").toUpperCase();
      const value = summaryJSON[key];
      doc.font("Helvetica-Bold").text(`${label}:`);
      doc.font("Helvetica").text(value);
      doc.moveDown();
    }

    if (imagePath && fs.existsSync(imagePath)) {
      doc.addPage();
      doc.font("Helvetica-Bold").text("GARAGE PHOTO (IF AVAILABLE):");
      doc.moveDown(2);
      doc.image(imagePath, { fit: [500, 300], align: "center" });
    }

    doc.end();
    stream.on("finish", resolve);
    stream.on("error", reject);
  });
}

app.post("/message", async (req, res) => {
  try {
    const userMessage = req.body.message;
    const imageData = req.body.images?.[0];
    if (imageData) uploadedImageData = imageData;

    conversationHistory.push({ role: "user", content: userMessage });

    const completion = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [
        { role: "system", content: solomonPrompt },
        ...conversationHistory
      ]
    });

    const aiReply = completion.choices[0].message.content;
    conversationHistory.push({ role: "assistant", content: aiReply });

    const shouldGenerateSummary = /summary complete|here is your intake summary/i.test(aiReply);
    let responsePayload = { reply: aiReply };

    if (shouldGenerateSummary) {
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const photoPath = uploadedImageData ? path.join(__dirname, `garage-${timestamp}.jpg`) : null;

      if (uploadedImageData) {
        const base64Data = uploadedImageData.replace(/^data:image\/\w+;base64,/, "");
        fs.writeFileSync(photoPath, base64Data, "base64");
      }

      const extractionCompletion = await openai.chat.completions.create({
        model: "gpt-4",
        messages: [
          { role: "system", content: extractionPrompt },
          { role: "user", content: conversationHistory.map(m => m.content).join("\n") }
        ]
      });

      const summaryJSON = JSON.parse(extractionCompletion.choices[0].message.content);
      const summaryPath = path.join(__dirname, `summary-${timestamp}.pdf`);
      await generateSummaryPDF(summaryJSON, photoPath, summaryPath);

      await drive.files.create({
        requestBody: { name: `Garage Project Summary - ${timestamp}.pdf`, mimeType: "application/pdf" },
        media: { mimeType: "application/pdf", body: fs.createReadStream(summaryPath) }
      });
      fs.unlinkSync(summaryPath);

      if (photoPath && fs.existsSync(photoPath)) {
        await drive.files.create({
          requestBody: { name: `Garage Photo - ${timestamp}.jpg`, mimeType: "image/jpeg" },
          media: { mimeType: "image/jpeg", body: fs.createReadStream(photoPath) }
        });
        fs.unlinkSync(photoPath);
      }

      conversationHistory = [];
      uploadedImageData = null;
    }

    res.json(responsePayload);
  } catch (err) {
    console.error("❌ Server error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.listen(port, () => {
  console.log(`✅ Contact Solomon backend running on port ${port}`);
}).on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`❌ Port ${port} is already in use. Please restart your environment or change the port.`);
    process.exit(1);
  } else {
    throw err;
  }
});
