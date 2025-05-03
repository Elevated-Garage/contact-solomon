const { OpenAI } = require("openai");
const solomonPrompt = require("fs").readFileSync("./prompts/solomon-prompt.txt", "utf8");
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function generateChatResponse(sessionId, conversationHistory) {
  const completion = await openai.chat.completions.create({
    model: "gpt-4",
    messages: [
      { role: "system", content: solomonPrompt },
      ...conversationHistory
    ],
    temperature: 0.7
  });

  return completion.choices[0].message.content;
}

module.exports = generateChatResponse;
