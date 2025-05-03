require("dotenv").config();
const OpenAI = require("openai");
const fs = require("fs");

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function chatResponder(messageHistory, missingFields = []) {
  let solomonPrompt = "You are Solomon, a helpful assistant.";
  try {
    solomonPrompt = fs.readFileSync("./prompts/solomon-prompt.txt", "utf8");
  } catch (err) {
    console.warn("Prompt file missing or unreadable (chatResponder):", err.message);
  }

  // If missing fields are provided, generate a natural re-ask message
  if (missingFields.length > 0) {
    const naturalList = formatFieldList(missingFields);
    return `Thanks! Could you help me out with just a few more details — specifically your ${naturalList}? That’ll help me finish setting everything up.`;
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

function formatFieldList(fields) {
  if (fields.length === 1) return fields[0];
  if (fields.length === 2) return `${fields[0]} and ${fields[1]}`;
  return fields.slice(0, -1).join(", ") + ", and " + fields[fields.length - 1];
}

module.exports = chatResponder;
