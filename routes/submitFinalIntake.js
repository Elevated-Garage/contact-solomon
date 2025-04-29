const express = require('express');
const router = express.Router();
const { getConversation, getPhotos } = require('../services/memoryStore');
const { extractIntakeData } = require('../services/openaiService');
const { generateSummaryPDF } = require('../utils/pdfBuilder');
const { uploadFile } = require('../services/driveService');
const fs = require('fs');
const path = require('path');

router.post('/', async (req, res) => {
  try {
    const sessionId = req.headers['x-session-id'];

    if (!sessionId) {
      return res.status(400).json({ error: "Missing session ID." });
    }

    const conversationHistory = getConversation(sessionId);
    const uploadedPhotos = getPhotos(sessionId);

    if (conversationHistory.length === 0 && uploadedPhotos.length === 0) {
      return res.status(400).json({ error: "No conversation or photos found for this session." });
    }

    console.log(`🧠 Session ${sessionId}: Building final intake summary...`);

    // Build conversation transcript
    const transcript = conversationHistory
      .filter(m => m.role === "user" || m.role === "assistant")
      .map(m => `${m.role}: ${m.content}`)
      .join("\n");

    // Extract structured intake
    const rawIntake = await extractIntakeData(transcript);

    // Parse extracted data safely
    let intakeData = {};
    try {
      intakeData = JSON.parse(rawIntake);
    } catch (err) {
      console.error("❌ Failed to parse extracted intake data:", err.message);
    }

    if (!intakeData.full_name || !intakeData.email || !intakeData.phone) {
      return res.status(400).json({ error: "Missing essential intake fields." });
    }

    // Build human-readable summary text
    const summaryText = Object.entries(intakeData)
      .map(([k, v]) => `${k.replace(/_/g, ' ')}: ${v}`)
      .join("\n");

    // Generate the PDF
    const pdfPath = await generateSummaryPDF(summaryText, uploadedPhotos);

    // Upload PDF to Google Drive
    const uploadRes = await uploadFile(
      `Garage-Project-Summary-${sessionId}.pdf`,
      "application/pdf",
      fs.createReadStream(pdfPath)
    );

    console.log(`✅ Session ${sessionId}: Final summary uploaded to Drive.`);

    // Clean up local temp PDF
    fs.unlinkSync(pdfPath);

    res.json({ success: true, driveFileId: uploadRes });

  } catch (err) {
    console.error("❌ Submit Final Intake error:", err.message);
    res.status(500).json({ error: "Failed to complete final intake submission." });
  }
});

    module.exports = router;
