require("dotenv").config();
const OpenAI = require("openai");
const fs = require("fs");

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function intakeExtractor(userMessage) {
  let intakePrompt = "";
  try {
    intakePrompt = fs.readFileSync("./prompts/intake-extractor-prompt.txt", "utf8");
  } catch (err) {
    console.warn("Prompt file missing or unreadable (intakeExtractor):", err.message);
    intakePrompt = "Extract JSON intake fields from this message: {{message}}";
  }

  const finalPrompt = intakePrompt.replace("{{message}}", userMessage);

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        { role: "system", content: finalPrompt }
      ]
    });

    const content = completion.choices[0].message.content.trim();

    // ✨ Try parsing JSON safely (in case AI adds formatting)
    let jsonStart = content.indexOf("{");
    let jsonEnd = content.lastIndexOf("}") + 1;
    const rawJSON = content.slice(jsonStart, jsonEnd);

    const parsedFields = JSON.parse(rawJSON);

    console.log("[intakeExtractor] Fields extracted:", parsedFields);
    return parsedFields;
  } catch (error) {
    console.error("[intakeExtractor] AI or parsing error:", error.message);
    return {};
  }
}

module.exports = intakeExtractor;
