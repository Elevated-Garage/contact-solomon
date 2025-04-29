const express = require('express');
const router = express.Router();
const { chatWithSolomon } = require('../services/openaiService');
const { saveMessage, getConversation } = require('../services/conversationService');


router.post('/', async (req, res) => {
  try {
    const { sessionId, message } = req.body;

    if (!sessionId || !message) {
      return res.status(400).json({ error: "Missing sessionId or message." });
    }

    // Save the user's message
    saveMessage(sessionId, { role: 'user', content: message });

    // Build conversation history for AI
    const history = [
      { role: 'system', content: process.env.SOLMON_PRIMING || "Default Solomon Priming..." },
      ...getConversation(sessionId)
    ];

    const aiReply = await chatWithSolomon(history);

    // Save the AI's reply
    saveMessage(sessionId, { role: 'assistant', content: aiReply });

    console.log(`📨 Session ${sessionId}: AI replied.`);

    res.json({ reply: aiReply });

  } catch (err) {
    console.error("❌ Message route error:", err.message);
    res.status(500).json({ error: "Something went wrong handling your message." });
  }
});

    module.exports = router;

