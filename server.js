
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

const auth = new google.auth.GoogleAuth({
  keyFile: "credentials.json",
  scopes: ["https://www.googleapis.com/auth/drive"],
});


const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

app.get("/auth", (req, res) => {
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: "offline",
    scope: ["https://www.googleapis.com/auth/drive.file"],
  });
  res.redirect(authUrl);
});

app.get("/api/oauth2callback", async (req, res) => {
  const code = req.query.code;
  const { tokens } = await oauth2Client.getToken(code);
  oauth2Client.setCredentials(tokens);
  fs.writeFileSync("token.json", JSON.stringify(tokens));
  res.send("✅ Authorization successful! You can close this tab.");
});

async function submitFinalIntakeSummary(conversationHistory) {
  const authClient = await auth.getClient();
  const drive = google.drive({ version: "v3", auth: authClient });

  const fileMetadata = {
    name: `Garage Intake Summary - ${new Date().toISOString()}.txt`,
    parents: [process.env.GOOGLE_DRIVE_FOLDER_ID],
  };

  const fileContent = conversationHistory.map(entry => `${entry.role}: ${entry.content}`).join("\n");

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
    "You are Solomon, an AI assistant helping manage garage remodel project intake for Elevated Garage.",
    "Start the conversation warmly and naturally. Your first goal is to collect the user's full name, email, and phone number early on.",
    "",
    "Do not ask all questions at once. Instead, weave them in naturally, one at a time, based on context.",
    "Ensure the following 10 key topics are answered before concluding:",
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
    "",
    "If the user uploads a photo, thank them and let them know the Elevated Garage team will review it. Do NOT say you cannot view images.",
    "If the user skips the upload, say that's okay and move on normally.",
    "",
    "When discussing budget:",
    "- Only offer a ballpark material-only price range if asked",
    "- Never suggest the budget is more than enough",
    "- Instead, acknowledge it as a helpful starting point, and explain final cost depends on materials, labor, and customization",
    "- Then, continue by asking for the preferred start date",
    "",
    "Once all topics are covered, end the conversation warmly with:",
    "'Thanks for sharing everything — this gives us a great foundation to begin planning your garage. We'll follow up with next steps soon!'",
    "",
    "Only output valid JSON. Respond with structured data using the following keys:",
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
    "",
    "Conversation:",
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
  const { conversationHistory } = req.body;

  const extractedData = await extractIntakeData(conversationHistory);
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
