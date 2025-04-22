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

const auth = new google.auth.GoogleAuth({
  credentials: JSON.parse(process.env.GOOGLE_CREDENTIALS),
  scopes: ["https://www.googleapis.com/auth/drive"],
});

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

try {
  });
} catch (err) {
  console.warn("⚠️ No existing token.json found. You'll need to reauthorize at /auth.");
}

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});


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
  "",
  "Here is the full conversation transcript:",
  conversationText
].join("\n");

  const completion = await openai.chat.completions.create({
    model: "gpt-4",
    messages: [{ role: "system", content: prompt }],
    temperature: 0.2,
  });

  try {
    return JSON.parse(completion.choices[0].message.content);
  } catch (e) {
    console.error("❌ Failed to parse GPT response:", completion.choices[0].message.content);
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

  let extractedData = null;
  try {
    extractedData = await extractIntakeData(conversationHistory);
  } catch (err) {
    console.error("🔥 Error during GPT extraction:", err);
  }
  console.log("🧠 GPT extracted data:", extractedData);

  if (extractedData && Object.keys(extractedData).length >= 3) {
    console.log("✅ Submitting final intake summary via GPT logic.");
    await submitFinalIntakeSummary(conversationHistory);
  }

  res.json({ success: true });
});

app.listen(port, () => {
  console.log(`✅ Contact Solomon backend running on port ${port}`);
});
