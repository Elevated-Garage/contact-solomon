require("dotenv").config();
const OpenAI = require("openai");
const fs = require("fs");

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function intakeExtractor(conversation) {
  let intakePrompt = "Extract key intake data from the user's message.";
  try {
    intakePrompt = fs.readFileSync("./prompts/intake-extractor-prompt.txt", "utf8");
  } catch (err) {
    console.warn("Prompt file missing or unreadable (intakeExtractor):", err.message);
  }

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        { role: "system", content: intakePrompt.replace("{{message}}", conversation) }
      ]
    });

    const content = completion.choices[0].message.content;
    return JSON.parse(content);
  } catch (error) {
    console.error("intakeExtractor AI error:", error.message);
    return {};
  }
}

module.exports = intakeExtractor;
