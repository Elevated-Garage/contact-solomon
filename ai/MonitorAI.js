// MonitorAI.js (Smart but Silent)

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
  } = config;

  const done = await doneChecker(intakeData, requiredFields);
  const missingFields = done?.missingFields || [];

  const photoValue = intakeData[photoField];
  const photoUploaded = photoValue === "Uploaded";
  const photoSkipped = photoValue === "Skipped";
  const photoMissing = !photoUploaded && !photoSkipped;


  // 🧠 If intake is incomplete, ask AI which field to target next
  if (!done?.isComplete && missingFields.length > 0) {
    const fieldPrompt = `
You are an intelligent intake assistant. Based on the conversation below, choose the most natural next field to ask for.
Only choose from this list of missing fields: ${missingFields.join(", ")}.

Respond ONLY in JSON format:
{
  "nextField": "field_name_here"
}

Conversation:
${conversation.map(m => `${m.role === 'user' ? 'User' : 'Solomon'}: ${m.content}`).join("\n")}
`;

    try {
      const response = await openai.chat.completions.create({
        model: "gpt-4-turbo",
        messages: [
          { role: "system", content: fieldPrompt }
        ]
      });

      const content = response.choices[0].message.content.trim();
      const parsed = JSON.parse(content);
      const aiFieldChoice = parsed.nextField;

      return {
        isComplete: false,
        nextStep: "ask_field",
        missingFields,
        aiFieldChoice,
        reply: null,
        triggerUpload: false,
        showSummary: false
      };
    } catch (err) {
      console.warn("[MonitorAI] Field selection failed. Falling back.");
      return {
        isComplete: false,
        nextStep: "ask_field",
        missingFields,
        aiFieldChoice: missingFields[0],
        reply: null,
        triggerUpload: false,
        showSummary: false
      };
    }
  }

  // 🖼 Ask for photo if needed
 if (done?.isComplete && photoRequired && photoMissing) {
  console.log("🧠 Done is complete but photo missing. Triggering upload.");
  return {
    isComplete: false,
    nextStep: "request_photo",
    missingFields: [],
    aiFieldChoice: null,
    reply: null,
    triggerUpload: true,
    showSummary: false
  };
}


  // ✅ All done — ready to summarize
 const canProceed =
  !photoRequired || photoUploaded || photoSkipped || generatePdfWithoutPhoto;

if (done?.isComplete && canProceed) {
  if (photoUploaded) {
    console.log("✅ Photo uploaded — proceeding to summary.");
  } else if (photoSkipped) {
    console.log("⏭️ Photo skipped — proceeding to summary.");
  } else if (!photoRequired) {
    console.log("📃 Photo not required — proceeding to summary.");
  }

  return {
    isComplete: true,
    nextStep: "submit_summary",
    missingFields: [],
    aiFieldChoice: null,
    reply: null,
    triggerUpload: false,
    showSummary: true
  };
}


  // Fallback — wait
  return {
    isComplete: false,
    nextStep: "wait",
    missingFields,
    aiFieldChoice: null,
    reply: null,
    triggerUpload: false,
    showSummary: false
  };
}

module.exports = MonitorAI;

