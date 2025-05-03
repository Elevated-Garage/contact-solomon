const express = require("express");
const fs = require("fs");
const multer = require("multer");
const nodemailer = require("nodemailer");
const { v4: uuidv4 } = require("uuid");
const { GoogleAuth } = require("google-auth-library");
const { google } = require("googleapis");
const bodyParser = require("body-parser");
const cors = require("cors");
require("dotenv").config();

const app = express();
const port = process.env.PORT || 10000;
app.use(cors());
app.use(bodyParser.json({ limit: "20mb" }));
app.use(bodyParser.urlencoded({ extended: true, limit: "20mb" }));

const ENABLE_AI_DONE_CHECK = true; // ✅ AI 3 is ON

// Single definition of requiredFields
const requiredFields = [
  "full_name",
  "email",
  "phone",
  "garage_goals",
  "square_footage",
  "must_have_features",
  "budget",
  "start_date",
  "final_notes"
];

const userIntakeOverrides = {};

// ✅ AI 1: Intake logic placeholder
// ✅ AI 2: Follow-up AI logic placeholder
// ✅ AI 3: Done-check logic
function isFieldComplete(sessionId) {
  return requiredFields.every(field =>
    userIntakeOverrides[sessionId]?.[field]?.trim() !== ""
  );
}

// ✅ POST /message
app.post("/message", (req, res) => {
  const { sessionId, message } = req.body;

  if (!sessionId || !message) {
    return res.status(400).json({ error: "Missing sessionId or message." });
  }

  // Save message, run AI logic, update memory, respond
  console.log("✅ Message received from session:", sessionId);
  // ...Insert AI logic here

  res.status(200).json({ response: "AI response would go here." });
});

// ✅ POST /update-intake
app.post("/update-intake", (req, res) => {
  const sessionId = req.headers["x-session-id"];
  const { field, value } = req.body;

  if (!sessionId || !field || typeof value !== "string") {
    return res.status(400).json({ error: "Missing required data." });
  }

  if (!(sessionId in userIntakeOverrides)) {
    userIntakeOverrides[sessionId] = {};
  }

  userIntakeOverrides[sessionId][field] = value;
  res.status(200).json({ success: true });
});

// ✅ Final AI check route (if needed)
app.get("/done-check/:sessionId", (req, res) => {
  const sessionId = req.params.sessionId;
  const complete = isFieldComplete(sessionId);
  res.status(200).json({ complete });
});

// ✅ Start server
app.listen(port, () => {
  console.log(`✅ Contact Solomon backend running on port ${port}`);
});

