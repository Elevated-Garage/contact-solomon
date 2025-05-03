require("dotenv").config();
const OpenAI = require("openai");
const fs = require("fs");

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function doneChecker(fields) {
  let donePrompt = "Check if all required fields are complete.";
  try {
    donePrompt = fs.readFileSync("./prompts/intake-done-checker.txt", "utf8");
  } catch (err) {
    console.warn("Prompt file missing or unreadable (doneChecker):", err.message);
  }

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        { role: "system", content: donePrompt.replace("{{fields}}", JSON.stringify(fields, null, 2)) }
      ]
    });

    const response = completion.choices[0].message.content;
    return response.includes("✅");
  } catch (error) {
    console.error("doneChecker AI error:", error.message);
    return false;
  }
}

module.exports = doneChecker;
