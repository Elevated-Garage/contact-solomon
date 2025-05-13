
const OpenAI = require("openai");
const doneChecker = require("./doneChecker");
const intakeExtractor = require("./intakeExtractor");

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/**
 * MonitorAI: Determines next step in the intake flow.
 * @param {Object} params
 * @param {Array} params.conversation - Full message history
 * @param {Object} params.intakeData - Current extracted field values
 * @param {Object} params.sessionMemory - Memory flags (photo, payment, etc)
 * @param {Object} params.config - Industry-specific settings
 * @returns {Object} { isComplete, nextStep, reply, missingFields, triggerUpload, showSummary }
 */
async function MonitorAI({ conversation = [], intakeData = {}, sessionMemory = {}, config = {} }) {
  const { requiredFields = [], photoField = "photo", photoRequired = true } = config;

  // Run field check
  const done = await doneChecker(intakeData, requiredFields);
  const photoUploaded = intakeData[photoField] === "Uploaded";
  const photoSkipped = intakeData[photoField] === "Skipped";

  // If fields are incomplete, ask AI how to proceed
  if (!done.isComplete) {
    const prompt = `
You are a helpful assistant guiding a user through an intake process for a ${config.industry || "service"} project.
The following fields are missing: ${done.missingFields.join(", ")}.
Respond with a concise, friendly message asking for one of these fields next.
Reply only in JSON format like:
{
  "nextStep": "ask_field",
  "missingFields": [...],
  "reply": "Your message to the user here"
}`;

    const response = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [
        { role: "system", content: prompt },
        { role: "user", content: conversation.map(m => \`\${m.role}: \${m.content}\`).join("\n") }
      ]
    });

    const content = response.choices[0].message.content.trim();
    try {
      const parsed = JSON.parse(content);
      return {
        isComplete: false,
        nextStep: parsed.nextStep || "ask_field",
        missingFields: done.missingFields,
        reply: parsed.reply || "",
        triggerUpload: false,
        showSummary: false
      };
    } catch (e) {
      return {
        isComplete: false,
        nextStep: "ask_field",
        missingFields: done.missingFields,
        reply: "Almost done! Could you answer the remaining questions?",
        triggerUpload: false,
        showSummary: false
      };
    }
  }

  // If all fields are complete but photo is still required
  if (done.isComplete && photoRequired && !photoUploaded && !photoSkipped) {
    return {
      isComplete: false,
      nextStep: "request_photo",
      reply: config.photoPrompt || "📸 Before we wrap up, could you upload a photo or skip?",
      triggerUpload: true,
      missingFields: [],
      showSummary: false
    };
  }

  // If everything is ready
  return {
    isComplete: true,
    nextStep: "submit_summary",
    reply: config.completeMessage || "✅ All set! Ready to finalize your project summary.",
    triggerUpload: false,
    missingFields: [],
    showSummary: true
  };
}

module.exports = MonitorAI;
