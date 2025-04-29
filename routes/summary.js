const express = require('express');
const router = express.Router();
const { useAIModel } = require('../utils/useAIModel');
const fs = require('fs');
const path = require('path');

const extractionPrompt = fs.readFileSync(path.join(__dirname, '../prompts/extraction-prompt.txt'), 'utf8');

router.post('/generate-summary', async (req, res) => {
  const sessionId = req.headers['x-session-id'];
  if (!sessionId || !userConversations[sessionId]) {
    return res.status(400).json({ error: 'No session data found.' });
  }

  try {
    const extracted = await useAIModel('openai', extractionPrompt, userConversations[sessionId]);
    res.json(JSON.parse(extracted));
  } catch (err) {
    console.error('❌ Error extracting summary:', err.message);
    res.status(500).json({ error: 'Failed to generate summary.' });
  }
});

module.exports = router;
