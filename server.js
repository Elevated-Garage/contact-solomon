
const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const OpenAI = require("openai");
const { google } = require("googleapis");
const fs = require("fs");
const path = require("path");
require("dotenv").config();

const app = express();
const port = 10000;

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

const extractIntakeData = async (history) => {
  const transcript = history
    .filter(m => m.role === "user" || m.role === "assistant")
    .map(m => `${m.role}: ${m.content}`)
    .join("\n");

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
  const { conversationHistory, trigger_summary } = req.body;

  if (!Array.isArray(conversationHistory)) {
    return res.status(400).json({ error: "Invalid history format." });
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

    let done = false;

    if (trigger_summary === true) {
      const extracted = await extractIntakeData(conversationHistory);
      done = extracted && Object.values(extracted).every(v => v && v.length > 0);

      if (done) {
        const summary = Object.entries(extracted)
          .map(([k, v]) => `${k.replace(/_/g, " ")}: ${v}`)
          .join("\n");
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

    console.log("✅ GPT summary extracted and submitted via trigger_summary flag.");
    res.json({ reply: aiReply, done });
  } catch (err) {
    console.error("❌ Chat error:", err.message);
    res.json({ reply: "Sorry, I hit an issue. Try again?", done: false });
  }
});

app.listen(port, () => {
  console.log(`✅ Contact Solomon backend running on port ${port}`);
});
