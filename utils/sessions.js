// utils/sessions.js

// 🧠 In-memory session stores
const userConversations = {};
const userUploadedPhotos = {};
const userIntakeOverrides = {};
const userFlags = {}; // ✅ New: for state like photoRequested, skipTracking, etc.

/**
 * Generates a unique session ID.
 */
function generateSessionId() {
  return Math.random().toString(36).substring(2, 15);
}

/**
 * Initializes memory for a new session.
 */
function ensureSession(sessionId) {
  if (!userConversations[sessionId]) userConversations[sessionId] = [];
  if (!userUploadedPhotos[sessionId]) userUploadedPhotos[sessionId] = [];
  if (!userIntakeOverrides[sessionId]) userIntakeOverrides[sessionId] = {};
  if (!userFlags[sessionId]) userFlags[sessionId] = {}; // ✅ Now included
}

/**
 * Clears all session data for a given session ID.
 */
function clearSession(sessionId) {
  delete userConversations[sessionId];
  delete userUploadedPhotos[sessionId];
  delete userIntakeOverrides[sessionId];
  delete userFlags[sessionId]; // ✅ Clears flags too
}

// 🧾 Export all session data handlers
module.exports = {
  userConversations,
  userUploadedPhotos,
  userIntakeOverrides,
  userFlags, // ✅ Exposed for shared flag access
  ensureSession,
  clearSession,
  generateSessionId
};
