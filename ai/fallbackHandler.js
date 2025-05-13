const chatResponder = require('./chatResponder');
const intakeExtractor = require('./intakeExtractor');
const doneChecker = require('./doneChecker');

/**
 * Handles fallback when intake is incomplete.
 * @param {object} session - intakeSession object with .data
 * @param {string} userInput - raw user input
 * @returns {object} { isComplete, reply, updatedData }
 */
async function handleFallback({ data, conversation, sessionMemory })
 {
  // Extract new info from input
  const newFields = await intakeExtractor(userInput);
  const newFields = await intakeExtractor(conversation || []);
  const mergedData = { ...data, ...newFields };


  // Check completeness
  const done = await doneChecker(mergedData);

  if (!done.isComplete) {
    const prompt = await chatResponder(conversation || [], done.missingFields, sessionMemory);
    return {
      isComplete: false,
      reply: prompt.message,
      updatedData: mergedData
    };
  }

  return {
    isComplete: true,
    updatedData: mergedData
  };
}

module.exports = handleFallback;
