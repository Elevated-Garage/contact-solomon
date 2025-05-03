// utils/sessions.js

// In-memory session store
const userConversations = {};
const userUploadedPhotos = {};
const userIntakeOverrides = {};

/**
 * Returns or initializes a session entry.
 */
function ensureSession(sessionId) {
  if (!userConversations[sessionId]) userConversations[sessionId] = [];
  if (!userUploadedPhotos[sessionId]) userUploadedPhotos[sessionId] = [];
  if (!userIntakeOverrides[sessionId]) userIntakeOverrides[sessionId] = {};
}

/**
 * Clears all session data for a given session ID.
 */
function clearSession(sessionId) {
  delete userConversations[sessionId];
  delete userUploadedPhotos[sessionId];
  delete userIntakeOverrides[sessionId];
}

module.exports = {
  userConversations,
  userUploadedPhotos,
  userIntakeOverrides,
  ensureSession,
  clearSession
};

