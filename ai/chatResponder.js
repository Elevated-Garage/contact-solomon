require("dotenv").config();
const OpenAI = require("openai");
const fs = require("fs");

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function chatResponder(messageHistory, missingFields = [], sessionMemory = {}) {
  let solomonPrompt = "You are Solomon, a helpful assistant.";
  try {
    solomonPrompt = fs.readFileSync("./prompts/solomon-prompt.txt", "utf8");
  } catch (err) {
    console.warn("Prompt file missing or unreadable (chatResponder):", err.message);
  }

  // If missing fields are provided, generate a natural re-ask message
  if (missingFields.length > 0) {
    const naturalList = formatFieldList(missingFields);
    return {
      message: `Thanks! Could you help me out with just a few more details — specifically your ${naturalList}? That’ll help me finish setting everything up.`
    };
  }

  // Smart photo request trigger
  const intakeData = sessionMemory.intakeData || {};
  const isIntakeComplete = sessionMemory.doneCheckerComplete === true;
  const alreadyHasPhoto = intakeData.photo_upload || sessionMemory.photoUploaded;

  if (isIntakeComplete && !alreadyHasPhoto && !sessionMemory.photoRequested) {
    sessionMemory.photoRequested = true;

    return {
      message: "📸 Could you upload a photo of your garage so I can include it in the project summary?",
      signal: "triggerUploader"
    };
  }

  // Sanitize messages
  const cleanedMessages = [
    { role: "system", content: solomonPrompt },
    ...messageHistory.map(m => ({
      role: m.role,
      content: typeof m.content === "string" ? m.content : JSON.stringify(m.content)
    }))
  ];

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4",
      messages: cleanedMessages
    });

    return {
      message: completion.choices[0].message.content
    };
  } catch (error) {
    console.error("chatResponder AI error:", error.message);
    return {
      message: "⚠️ I'm having trouble responding right now. Please try again."
    };
  }
}

function formatFieldList(fields) {
  if (fields.length === 1) return fields[0];
  if (fields.length === 2) return `${fields[0]} and ${fields[1]}`;
  return fields.slice(0, -1).join(", ") + ", and " + fields[fields.length - 1];
}

module.exports = chatResponder;
