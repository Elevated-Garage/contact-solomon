
const express = require('express');
const fs = require('fs');
const path = require('path');
const router = express.Router();

const CONFIG_PATH = path.join(__dirname, 'admin-config.json');

// GET /admin/settings
router.get('/settings', (req, res) => {
  try {
    const config = fs.readFileSync(CONFIG_PATH, 'utf-8');
    res.json(JSON.parse(config));
  } catch (err) {
    res.status(500).json({ error: 'Failed to load settings.' });
  }
});

// POST /admin/save-settings
router.post('/save-settings', (req, res) => {
  try {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(req.body, null, 2));
    res.sendStatus(200);
  } catch (err) {
    res.status(500).json({ error: 'Failed to save settings.' });
  }
});

module.exports = router;
