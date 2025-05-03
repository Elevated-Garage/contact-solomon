// utils/sessions.js

// In-memory session store
const userConversations = {};
const userUploadedPhotos = {};
const userIntakeOverrides = {};

// ✅ FIXED: Removed stray closing brace that caused a syntax error
// ❌ This line was outside any function: }

function generateSessionId() {
  return Math.random().toString(36).substring(2, 15);
}

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
  clearSession,
  generateSessionId // ✅ This was missing from your export
};


