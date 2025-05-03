require("dotenv").config();
const OpenAI = require("openai");
const fs = require("fs");

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function chatResponder(messageHistory) {
  let solomonPrompt = "You are Solomon, a helpful assistant.";
  try {
    solomonPrompt = fs.readFileSync("./prompts/solomon-prompt.txt", "utf8");
  } catch (err) {
    console.warn("Prompt file missing or unreadable (chatResponder):", err.message);
  }

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [
        { role: "system", content: solomonPrompt },
        ...messageHistory
      ]
    });

    return completion.choices[0].message.content;
  } catch (error) {
    console.error("chatResponder AI error:", error.message);
    return "⚠️ I'm having trouble responding right now. Please try again.";
  }
}

module.exports = chatResponder;
