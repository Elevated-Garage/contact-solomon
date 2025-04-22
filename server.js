
const express = require("express");
const bodyParser = require("body-parser");
const { google } = require("googleapis");
const OpenAI = require("openai");
const path = require("path");
const fs = require("fs");

const app = express();
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, "public")));

const port = process.env.PORT || 10000;

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

async function submitFinalIntakeSummary(conversationHistory) {
  const auth = new google.auth.GoogleAuth({
    credentials: JSON.parse(process.env.GOOGLE_CREDENTIALS),
    scopes: ["https://www.googleapis.com/auth/drive"],
  });

  const drive = google.drive({ version: "v3", auth });

  const fileContent = conversationHistory.map(entry => `${entry.role}: ${entry.content}`).join("\n");

  const fileMetadata = {
    name: `Garage Intake Summary - ${new Date().toISOString()}.txt`,
    parents: [process.env.GOOGLE_DRIVE_FOLDER_ID],
  };

  const media = {
    mimeType: "text/plain",
    body: fileContent,
  };

  await drive.files.create({
    resource: fileMetadata,
    media: media,
    fields: "id",
  });

  console.log("✅ Summary uploaded to Google Drive.");
}

async function extractIntakeData(conversationHistory) {
  const conversationText = conversationHistory.map(m => m.role + ": " + m.content).join("\n");

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
    "Use natural language understanding to infer vague answers (e.g., \"probably 400ish square feet\").",
    "If the user skips or declines the garage photo upload, set the field 'garage_photo_upload' to 'skipped'.",
    "",
    "Here is the full conversation transcript:",
    conversationText
  ].join("\n");

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [{ role: "system", content: prompt }],
      temperature: 0.2,
    });

    return JSON.parse(completion.choices[0].message.content);
  } catch (e) {
    console.error("❌ Failed to parse GPT response:", e.message);
    return null;
  }
}

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.post("/message", async (req, res) => {
  console.log("📨 /message hit");

  const { conversationHistory } = req.body;
  console.log("📋 Raw input:", JSON.stringify(conversationHistory, null, 2));

  if (!conversationHistory || !Array.isArray(conversationHistory)) {
    console.warn("❌ Missing or invalid conversationHistory in request body.");
    return res.status(400).json({ success: false, error: "Invalid conversation history format." });
  }

  try {
    // Just return a friendly AI reply (no summary yet)
    return res.json({ reply: "Thanks! What would you like to add next?", done: false });
  } catch (err) {
    console.error("❌ Server error:", err.message);
    res.status(500).json({ success: false, error: "Internal server error." });
  }
});

app.post("/submit-summary", async (req, res) => {
  console.log("📝 /submit-summary hit");

  const { conversationHistory } = req.body;
  if (!conversationHistory || !Array.isArray(conversationHistory)) {
    return res.status(400).json({ success: false, error: "Invalid conversation history format." });
  }

  try {
    const extractedData = await extractIntakeData(conversationHistory);
    console.log("🧠 Final extracted data:", extractedData);

    const hasAllFields = extractedData &&
      Object.values(extractedData).every(val => val && val.length > 0);

    if (!hasAllFields) {
      return res.status(400).json({ success: false, error: "Incomplete data. All fields must be filled." });
    }

    await submitFinalIntakeSummary(conversationHistory);
    return res.json({ success: true, show_summary: true });
  } catch (err) {
    console.error("❌ Error submitting final summary:", err.message);
    return res.status(500).json({ success: false, error: "Failed to submit summary." });
  }
});

app.listen(port, () => {
  console.log(`✅ Contact Solomon backend running on port ${port}`);
});
