const express = require('express');
const router = express.Router();
const multer = require('multer');
const { savePhoto } = require('../services/memoryStore');
const { uploadFile, bufferToStream } = require('../services/driveService');

const upload = multer({ storage: multer.memoryStorage() });

router.post('/', upload.array('photos'), async (req, res) => {
  try {
    const sessionId = req.headers['x-session-id'];

    if (!sessionId) {
      return res.status(400).json({ error: "Missing session ID." });
    }

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: "No photos uploaded." });
    }

    console.log(`📸 Session ${sessionId}: Received ${req.files.length} photos.`);

    for (const file of req.files) {
      // Save photo buffer in memory tied to session
      savePhoto(sessionId, file.buffer);

      // Upload photo immediately to Google Drive
      const stream = bufferToStream(file.buffer);
      const uploadRes = await uploadFile(file.originalname, file.mimetype, stream);

      console.log(`✅ Uploaded photo to Drive: ${uploadRes}`);
    }

    res.status(200).json({ success: true });

  } catch (err) {
    console.error("❌ Photo upload error:", err.message);
    res.status(500).json({ error: "Photo upload failed." });
  }
});

    module.exports = router;
