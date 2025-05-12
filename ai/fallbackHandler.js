const chatResponder = require('./chatResponder');
const intakeExtractor = require('./intakeExtractor');
const doneChecker = require('./doneChecker');

/**
 * Handles fallback when intake is incomplete.
 * @param {object} session - intakeSession object with .data
 * @param {string} userInput - raw user input
 * @returns {object} { isComplete, reply, updatedData }
 */
async function handleFallback(session, userInput) {
  // Extract new info from input
  const newFields = await intakeExtractor(userInput);
  const mergedData = { ...session.data, ...newFields };

  // Check completeness
  const done = await doneChecker(mergedData);

  if (!done.isComplete) {
    const prompt = await chatResponder({ missingFields: done.missingFields });
    return {
      isComplete: false,
      reply: prompt,
      updatedData: mergedData
    };
  }

  return {
    isComplete: true,
    updatedData: mergedData
  };
}

module.exports = handleFallback;
