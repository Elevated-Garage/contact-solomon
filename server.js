
const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const OpenAI = require("openai");
const { google } = require("googleapis");
const fs = require("fs");
const path = require("path");
require("dotenv").config();

const app = express();
app.use(cors());
app.use(bodyParser.json());
const port = 10000;

// GPT-4 Initialization
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Google Drive Setup
const auth = new google.auth.GoogleAuth({
  keyFile: process.env.GOOGLE_CREDENTIALS,
  scopes: ["https://www.googleapis.com/auth/drive.file"]
});
const drive = google.drive({ version: "v3", auth });

// Dummy intake extraction logic
const extractIntakeData = async (conversation) => {
  return {
    full_name: "example",
    email: "example@example.com",
    phone: "1234567890",
    garage_goals: "clean garage",
    square_footage: "400",
    must_have_features: "cabinets",
    budget: "10k",
    start_date: "May",
    final_notes: "none",
    garage_photo_upload: "skipped"
  };
};

// Solomon prompt for GPT-4
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

// GPT interaction endpoint
app.post("/message", async (req, res) => {
  const { conversationHistory } = req.body;

  if (!conversationHistory || !Array.isArray(conversationHistory)) {
    return res.status(400).json({ success: false, error: "Invalid conversation history format." });
  }

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [
        { role: "system", content: solomonPrompt },
        ...conversationHistory
      ]
    });

    const aiReply = completion.choices[0].message.content;
    const extractedData = await extractIntakeData(conversationHistory);
    const done = extractedData && Object.values(extractedData).every(val => val && val.length > 0);

    return res.json({ reply: aiReply, done });
  } catch (err) {
    console.error("❌ GPT error:", err.message);
    return res.json({ reply: "Thanks! What would you like to add next?", done: false });
  }
});

// Upload intake summary to Google Drive
app.post("/submit-summary", async (req, res) => {
  const { summaryText } = req.body;

  if (!summaryText) {
    return res.status(400).json({ success: false, error: "Missing summaryText in body." });
  }

  try {
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const fileName = `Garage-Intake-${timestamp}.txt`;
    const filePath = path.join(__dirname, fileName);
    fs.writeFileSync(filePath, summaryText);

    const driveResponse = await drive.files.create({
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

    fs.unlinkSync(filePath); // clean up

    res.json({ success: true, fileId: driveResponse.data.id });
  } catch (err) {
    console.error("❌ Drive upload error:", err.message);
    res.status(500).json({ success: false, error: "Failed to upload to Drive." });
  }
});

app.listen(port, () => {
  console.log(`✅ Contact Solomon backend running on port ${port}`);
});
