// ai/MonitorAI.js
const OpenAI = require("openai");
const fs = require("fs");

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function monitorSystem(intakeData, userFlags) {
  let basePrompt = "";
  try {
    basePrompt = fs.readFileSync("./prompts/monitor-ai.txt", "utf8");
  } catch (err) {
    console.warn("⚠️ Missing prompt file for MonitorAI:", err.message);
  }

  try {
    const systemState = {
      intakeData,
      flags: userFlags || {},
    };

    const promptWithContext = basePrompt.replace("{{context}}", JSON.stringify(systemState, null, 2));

    const response = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [{ role: "system", content: promptWithContext }],
    });

    const content = response.choices[0].message.content;
    console.log("🧠 MonitorAI report:", content);

    return content;
  } catch (err) {
    console.error("❌ MonitorAI failed:", err.message);
    return "⚠️ MonitorAI could not evaluate the system state.";
  }
}

module.exports = monitorSystem;
