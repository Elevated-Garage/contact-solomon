const userConversations = {};
const userIntakeOverrides = {};
const userUploadedPhotos = {};
const userFlags = {};  // Optional: for `photoRequested`, etc.

function ensureSession(sessionId) {
  if (!userConversations[sessionId]) {
    userConversations[sessionId] = [];
    userIntakeOverrides[sessionId] = {};
    userUploadedPhotos[sessionId] = [];
    userFlags[sessionId] = {};
  }
}

module.exports = {
  userConversations,
  userIntakeOverrides,
  userUploadedPhotos,
  userFlags,
  ensureSession
};
