const { OpenAI } = require("openai");
const doneCheckPrompt = require("fs").readFileSync("./prompts/prompt-done-check.txt", "utf8");
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function checkIfDone(userData) {
  const completion = await openai.chat.completions.create({
    model: "gpt-3.5-turbo",
    messages: [
      { role: "system", content: doneCheckPrompt },
      { role: "user", content: JSON.stringify(userData, null, 2) }
    ],
    temperature: 0
  });

  const response = completion.choices[0].message.content.trim();
  return response === "✅ All required fields are complete.";
}

module.exports = checkIfDone;
