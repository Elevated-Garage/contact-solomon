require("dotenv").config();
const OpenAI = require("openai");
const fs = require("fs");

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function intakeExtractor(conversation) {
  let intakePrompt = "";
  try {
    intakePrompt = fs.readFileSync("./prompts/intake-extractor-prompt.txt", "utf8");
  } catch (err) {
    console.warn("Prompt file missing or unreadable (intakeExtractor):", err.message);
    intakePrompt = "Extract JSON intake fields from this message: {{message}}";
  }

  const safeConversation = Array.isArray(conversation) ? conversation : [];
  const transcript = safeConversation
  .filter(entry => entry.role === "user")
  .map(entry => `User: ${entry.content}`)
  .join("\n");



  const finalPrompt = intakePrompt.replace("{{message}}", transcript);

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [{ role: "system", content: finalPrompt }]
    });

    const content = completion.choices[0].message.content.trim();
    const jsonStart = content.indexOf("{");
    const jsonEnd = content.lastIndexOf("}") + 1;
    const rawJSON = content.slice(jsonStart, jsonEnd);
    const parsedFields = JSON.parse(rawJSON);

    // ✅ Determine readiness to run doneChecker
    const requiredKeys = [
      "full_name",
      "email",
      "phone",
      "location",
      "goals",
      "square_footage",
      "must_have_features",
      "preferred_materials",
      "budget",
      "start_date",
      "final_notes"
    ];

    const acceptedShortAnswers = ["no", "none", "nope", "nothing else"];

  const isValid = (value) => {
  if (typeof value !== "string") return false;
  const cleaned = value.trim().toLowerCase();
  return cleaned !== "";
};


    
    // ✅ Normalize short acceptable answers for final_notes
   const normalizeNo = (val) => {
  const cleaned = val?.toLowerCase().trim();
  return ["no", "none", "nope", "nothing else", "n/a", "not sure", "i don't have any"].includes(cleaned);
};

// Normalize final_notes
if (parsedFields.final_notes && normalizeNo(parsedFields.final_notes)) {
  parsedFields.final_notes = "nothing else";
}

// Normalize preferred_materials
if (parsedFields.preferred_materials && normalizeNo(parsedFields.preferred_materials)) {
  parsedFields.preferred_materials = "Open to suggestions";
}


    const readyForCheck = requiredKeys.every(key => isValid(parsedFields[key]));

    console.log("[intakeExtractor] Fields extracted:", parsedFields);
    console.log("[intakeExtractor] Ready for doneChecker:", readyForCheck);

    return { fields: parsedFields, readyForCheck };
  } catch (error) {
    console.error("[intakeExtractor] AI or parsing error:", error.message);
    return { fields: {}, readyForCheck: false };
  }
}

module.exports = intakeExtractor;
