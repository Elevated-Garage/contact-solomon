const OpenAI = require("openai");
const doneChecker = require("./doneChecker");
const intakeExtractor = require("./intakeExtractor");

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function MonitorAI({ conversation = [], intakeData = {}, sessionMemory = {}, config = {} }) {
  const {
    requiredFields = [],
    photoField = "photo",
    photoRequired = true,
    generatePdfWithoutPhoto = false,
    photoPrompt = "📸 Before we wrap up, could you upload a photo or skip?",
    completeMessage = "✅ All set! Ready to finalize your project summary."
  } = config;

  const done = await doneChecker(intakeData, requiredFields);
  const missingFields = done?.missingFields || [];

  const photoUploaded = intakeData[photoField] === "Uploaded";
  const photoSkipped = intakeData[photoField] === "Skipped";

  // Prompt user for missing fields
  if (!done?.isComplete) {
    const prompt = `
You are a helpful assistant guiding a user through an intake process for a ${config.industry || "service"} project.
The following fields are missing: ${missingFields.join(", ")};
Respond with a concise, friendly message asking for one of these fields next.
Reply only in JSON format like:
{
  "nextStep": "ask_field",
  "missingFields": [...],
  "reply": "Your message to the user here"
}`;

    const response = await openai.chat.completions.create({
      model: "gpt-4-turbo",
      messages: [
        { role: "system", content: prompt },
        { role: "user", content: conversation.map(m => `${m.role}: ${m.content}`).join("\n") }
      ]
    });

    const content = response.choices[0].message.content.trim();
    try {
      const parsed = JSON.parse(content);

// 🛡️ Safety check: prevent GPT from saying "we're done" too early
if (!parsed.reply || parsed.reply.toLowerCase().includes("everything we need")) {
  parsed.reply = "Almost done! Could you answer the remaining questions?";
}
      if (process.env.VERBOSE_LOGGING === "true") {
        console.log("[MonitorAI] AI chose response:", parsed);
      }

      return {
        isComplete: false,
        nextStep: parsed.nextStep || "ask_field",
        missingFields,
        reply: parsed.reply || "",
        triggerUpload: false,
        showSummary: false
      };
    } catch {
      return {
        isComplete: false,
        nextStep: "ask_field",
        missingFields,
        reply: "Almost done! Could you answer the remaining questions?",
        triggerUpload: false,
        showSummary: false
      };
    }
  }

  // If all required fields are done but photo is still expected
  if (done?.isComplete && photoRequired && !photoUploaded && !photoSkipped) {
    return {
      isComplete: false,
      nextStep: "request_photo",
      reply: photoPrompt,
      triggerUpload: true,
      missingFields: [],
      showSummary: false
    };
  }

  // Final check – allow summary even without photo if configured
  const canProceed =
    !photoRequired || photoUploaded || photoSkipped || generatePdfWithoutPhoto;

  if (done?.isComplete && canProceed) {
    return {
      isComplete: true,
      nextStep: "submit_summary",
      reply: completeMessage,
      triggerUpload: false,
      missingFields: [],
      showSummary: true
    };
  }

  // Safety fallback
  return {
    isComplete: false,
    nextStep: "wait",
    reply: "Thanks! Let me know when you're ready to continue.",
    triggerUpload: false,
    missingFields,
    showSummary: false
  };
}

module.exports = MonitorAI;
