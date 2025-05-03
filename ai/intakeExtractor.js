const { OpenAI } = require("openai");
const extractionPromptTemplate = require("fs").readFileSync("./prompts/extraction-prompt.txt", "utf8");
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function extractIntakeFields(message) {
  const intakePrompt = extractionPromptTemplate.replace("{{message}}", message);

  const completion = await openai.chat.completions.create({
    model: "gpt-3.5-turbo",
    messages: [
      { role: "system", content: "You are a structured field extractor." },
      { role: "user", content: intakePrompt }
    ],
    temperature: 0
  });

  return JSON.parse(completion.choices[0].message.content);
}

module.exports = extractIntakeFields;
