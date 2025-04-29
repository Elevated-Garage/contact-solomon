const userConversations = {};

function saveMessage(sessionId, message) {
  if (!userConversations[sessionId]) {
    userConversations[sessionId] = [];
  }
  userConversations[sessionId].push(message);
}

function getConversation(sessionId) {
  return userConversations[sessionId] || [];
}

module.exports = {
  saveMessage,
  getConversation,
};
