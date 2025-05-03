require("dotenv").config();
const OpenAI = require("openai");
const fs = require("fs");

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function intakeExtractor(conversation) {
  let intakePrompt = "";
  try {
    intakePrompt = fs.readFileSync("./prompts/intake-extractor-prompt.txt", "utf8");
  } catch (err) {
    console.warn("Prompt file missing or unreadable (intakeExtractor):", err.message);
    intakePrompt = "Extract JSON intake fields from this message: {{message}}";
  }

  const transcript = conversation
    .map(entry => `${entry.role === "user" ? "User" : "Solomon"}: ${entry.content}`)
    .join("\n");

  const finalPrompt = intakePrompt.replace("{{message}}", transcript);

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [{ role: "system", content: finalPrompt }]
    });

    const content = completion.choices[0].message.content.trim();
    const jsonStart = content.indexOf("{");
    const jsonEnd = content.lastIndexOf("}") + 1;
    const rawJSON = content.slice(jsonStart, jsonEnd);
    const parsedFields = JSON.parse(rawJSON);

    // ✅ Determine readiness to run doneChecker
    const requiredKeys = [
      "full_name",
      "email",
      "phone",
      "garage_goals",
      "square_footage",
      "must_have_features",
      "budget",
      "start_date",
      "final_notes"
    ];

    const fillers = ["no", "none", "n/a", "not sure", "idk", "soon", "help", "?"];

    const isValid = value => {
      if (!value) return false;
      const cleaned = value.trim().toLowerCase();
      return cleaned !== "" && !fillers.includes(cleaned);
    };

    const readyForCheck = requiredKeys.every(key => isValid(parsedFields[key]));

    console.log("[intakeExtractor] Fields extracted:", parsedFields);
    console.log("[intakeExtractor] Ready for doneChecker:", readyForCheck);

    return { fields: parsedFields, readyForCheck };
  } catch (error) {
    console.error("[intakeExtractor] AI or parsing error:", error.message);
    return { fields: {}, readyForCheck: false };
  }
}

module.exports = intakeExtractor;
