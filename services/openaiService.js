const OpenAI = require('openai');
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function chatWithSolomon(conversationHistory) {
  const completion = await openai.chat.completions.create({
    model: "gpt-4",
    messages: conversationHistory,
    temperature: 0.7
  });
  return completion.choices[0].message.content;
}

async function extractIntakeData(transcript) {
  const extractionPrompt = process.env.EXTRACTION_PROMPT || "Default extraction prompt";

  const completion = await openai.chat.completions.create({
    model: "gpt-4",
    messages: [
      { role: "system", content: extractionPrompt },
      { role: "user", content: transcript }
    ],
    temperature: 0
  });
  return completion.choices[0].message.content;
}

module.exports = { chatWithSolomon, extractIntakeData };
