require("dotenv").config();
const OpenAI = require("openai");
const fs = require("fs");

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function doneChecker(fields) {
  let donePrompt = "";
  try {
    donePrompt = fs.readFileSync("./prompts/intake-done-checker.txt", "utf8");
  } catch (err) {
    console.warn("Prompt file missing or unreadable (doneChecker):", err.message);
  }

  try {
    const promptWithFields = donePrompt.replace("{{fields}}", JSON.stringify(fields, null, 2));

    console.log("[doneChecker] Checking fields:", fields);

    const completion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        { role: "system", content: promptWithFields }
      ]
    });

    const content = completion.choices[0].message.content;
    const isDone = content.includes("✅");
    const missingMatches = content.match(/Missing:\s*(.*)/i);
    const missing = missingMatches ? missingMatches[1].split(",").map(f => f.trim()) : [];

    console.log("[doneChecker] AI response:", content);
    return { done: isDone, missing };
  } catch (error) {
    console.error("doneChecker AI error:", error.message);
    return { done: false, missing: [] };
  }
}

module.exports = doneChecker;
