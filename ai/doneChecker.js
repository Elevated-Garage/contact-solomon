// doneChecker.js — Structured-only version (no OpenAI)

const requiredFields = [
  "full_name",
  "email",
  "phone",
  "garage_goals",
  "square_footage",
  "must_have_features",
  "budget",
  "start_date",
  "final_notes",
  "garage_photo_upload"
];

async function doneChecker(fields) {
  const missing = requiredFields.filter(field => {
    const value = fields[field];
    return !value || value.trim?.() === "";
  });

  return {
    done: missing.length === 0,
    missing
  };
}

module.exports = doneChecker;
