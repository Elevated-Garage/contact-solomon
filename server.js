
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
app.use(bodyParser.json());\napp.use(express.static(path.join(__dirname, "public")));
const port = 10000;

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Google Drive Setup
const auth = new google.auth.GoogleAuth({
  keyFile: process.env.GOOGLE_CREDENTIALS,
  scopes: ["https://www.googleapis.com/auth/drive.file"]
});
const drive = google.drive({ version: "v3", auth });

// Solomon's conversational prompt
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

// AI-enhanced extraction of intake answers
const extractIntakeData = async (conversationHistory) => {
  const prompt = [
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

  const transcript = conversationHistory
    .filter(entry => entry.role === "user" || entry.role === "assistant")
    .map(entry => `${entry.role}: ${entry.content}`)
    .join("\n");

  const completion = await openai.chat.completions.create({
    model: "gpt-4",
    messages: [
      { role: "system", content: prompt },
      { role: "user", content: transcript }
    ],
    temperature: 0
  });

  try {
    return JSON.parse(completion.choices[0].message.content);
  } catch (err) {
    console.error("❌ Failed to parse extracted data:", err.message);
    return {};
  }
};

// GPT-powered chat logic
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

    
    if (done) {
      const summaryLines = Object.entries(extractedData)
        .map(([key, value]) => `${key.replace(/_/g, ' ')}: ${value}`)
        .join("\n");
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const fileName = `Garage-Intake-${timestamp}.txt`;
      const filePath = path.join(__dirname, fileName);
      fs.writeFileSync(filePath, summaryLines);
      try {
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
        console.log("✅ Intake summary uploaded:", driveResponse.data.id);
      } catch (uploadErr) {
        console.error("❌ Upload failed:", uploadErr.message);
      }
    }
    return res.json({ reply: aiReply, done });
    
  } catch (err) {
    console.error("❌ GPT error:", err.message);
    return res.json({ reply: "Thanks! What would you like to add next?", done: false });
  }
});

// Summary upload to Google Drive
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

    fs.unlinkSync(filePath); // cleanup

    res.json({ success: true, fileId: driveResponse.data.id });
  } catch (err) {
    console.error("❌ Drive upload error:", err.message);
    res.status(500).json({ success: false, error: "Failed to upload to Drive." });
  }
});

app.listen(port, () => {
  console.log(`✅ Contact Solomon backend running on port ${port}`);
});
