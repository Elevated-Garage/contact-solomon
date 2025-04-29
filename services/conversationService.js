// services/conversationService.js

// In-memory conversation storage
const userConversations = {};

// Save a new message to a user's conversation history
function saveMessage(sessionId, message) {
  if (!userConversations[sessionId]) {
    userConversations[sessionId] = [];
  }
  userConversations[sessionId].push(message);
}

// Retrieve full conversation history for a user
function getConversation(sessionId) {
  return userConversations[sessionId] || [];
}

module.exports = {
  saveMessage,
  getConversation,
};
