
const express = require('express');
const multer = require('multer');
const cors = require('cors');
require('dotenv').config();
const path = require('path');

// Load adminConfig with fallback
let adminConfig = {
  enableDriveUpload: { enabled: true },
  enablePdfGeneration: { enabled: true },
  requirePhotoUpload: { enabled: true },
  enableStripeCheckout: { enabled: false },
  requiredFields: {
    value: [
      "full_name", "email", "phone", "location",
      "goals", "square_footage", "must_have_features",
      "preferred_materials", "budget", "start_date", "final_notes"
    ]
  }
};
try {
  adminConfig = require('./admin/admin-config.json');
  console.log("✅ Loaded admin-config.json");
} catch (e) {
  console.warn("⚠️ No admin-config.json found — using default settings.");
}

// Solomon core modules
const { generateSummaryPDF } = require('./utils/pdfBuilder');
const { generateSessionId } = require('./utils/sessions');
const intakeExtractor = require('./ai/intakeExtractor');
const chatResponder = require('./ai/chatResponder');
const doneChecker = require('./ai/doneChecker');
const MonitorAI = require('./ai/MonitorAI');
const {
  userConversations,
  userUploadedPhotos,
  userIntakeOverrides,
  userFlags,
  ensureSession
} = require('./utils/sessions');

// Admin portal
const { router: adminRoutes, logClientActivity } = require('./admin/admin.routes'); 
const app = express();
const port = process.env.PORT || 10000;

// 🔧 Global middleware
app.use(express.json());
app.use(cors());

// 🛡️ Admin Portal integration
app.use('/admin', express.static(path.join(__dirname, 'admin')));
app.use('/admin', adminRoutes);

// 🌐 Public site static files
app.use(express.static('public'));

// 📂 File upload setup (used later)
const storage = multer.memoryStorage();
const upload = multer({ storage });
const { uploadToDrive } = require('./utils/googleUploader');

// === Upload route ===
app.post('/upload-photos', upload.array('photos'), async (req, res) => {
  const sessionId = req.headers['x-session-id'];
  ensureSession(sessionId);

  req.files.forEach(file => userUploadedPhotos[sessionId].push(file));
  userIntakeOverrides[sessionId].photo = "Uploaded";


  try {
    // Upload each photo to Drive (optional but already implemented)
    for (const file of req.files) {
      await uploadToDrive({
        fileName: `${Date.now()}_${file.originalname}`,
        mimeType: file.mimetype,
        buffer: file.buffer,
        folderId: process.env.GDRIVE_FOLDER_ID
      });
    }

    // ✅ Now generate and upload the PDF
    const photos = userUploadedPhotos[sessionId] || [];
    let pdfBuffer;
    if (adminConfig.enablePdfGeneration?.enabled) {
      pdfBuffer = await generateSummaryPDF(userIntakeOverrides[sessionId], photos);
    }

    const uploaded = await uploadToDrive({
      fileName: `Garage-Quote-${sessionId}.pdf`,
      mimeType: 'application/pdf',
      buffer: pdfBuffer,
      folderId: process.env.GDRIVE_FOLDER_ID
    });

    console.log("[📸 Photos and PDF uploaded successfully]");
    
    logClientActivity("default", "photo");
    logClientActivity("default", "summary");

    
    res.status(200).json({
      show_summary: true,
      drive_file_id: uploaded.id,
      ...userIntakeOverrides[sessionId]
    });

  } catch (err) {
    console.error("❌ Failed to upload:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// === Skip photo upload route ===
app.post("/skip-photo-upload", async (req, res) => {
  const sessionId = req.headers["x-session-id"];
  if (!sessionId) return res.status(400).send("Missing session ID");
  ensureSession(sessionId);

  userIntakeOverrides[sessionId].photo = "Skipped";


  try {
    const pdfBuffer = await generateSummaryPDF(userIntakeOverrides[sessionId]);
    const uploaded = await uploadToDrive({
  fileName: `Garage-Quote-${sessionId}.pdf`,
  mimeType: 'application/pdf',
  buffer: pdfBuffer,
  folderId: process.env.GDRIVE_FOLDER_ID
});

console.log("[📸 Intake + Photo Complete] Summary PDF created and uploaded (skip path).");

   logClientActivity("default", "summary");
 

res.status(200).json({
  show_summary: true,
  drive_file_id: uploaded.id,
  ...userIntakeOverrides[sessionId]
});

  } catch (err) {
    console.error("❌ Failed to upload PDF after skip:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// === Main AI route ===

app.post('/message', async (req, res) => {
  const sessionId = req.headers['x-session-id'] || generateSessionId();
  const { message } = req.body;
  ensureSession(sessionId);

  // Handle empty or invalid input
  if ((!message || typeof message !== 'string' || message.trim() === '') && message !== '__init__') {
    return res.json({ reply: "Please type a message before sending." });
  }

  // Push user message
  userConversations[sessionId].push({ role: 'user', content: String(message) });

  // 🟢 Introductory reply if this is the first message
  if (userConversations[sessionId].length <= 2) {
    const intro = "Absolutely! I’d love to help you get started. What’s your name?";
    userConversations[sessionId].push({ role: 'assistant', content: intro });
    return res.status(200).json({ reply: intro });
  }

  // 🧼 Clean up conversation before passing to GPT
userConversations[sessionId] = userConversations[sessionId].map(m => ({
  ...m,
  content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content)
}));


  // GPT responds based on intake state
  let assistantReply = await chatResponder(
    userConversations[sessionId],
    [],
    { intakeData: userIntakeOverrides[sessionId] }
  );
  if (typeof assistantReply === 'object' && assistantReply?.message) {
  assistantReply = assistantReply.message;
} else if (typeof assistantReply !== 'string') {
  assistantReply = JSON.stringify(assistantReply);
}


  userConversations[sessionId].push({ role: 'assistant', content: assistantReply });

  // Run extractor AFTER GPT reply
  const { fields } = await intakeExtractor(userConversations[sessionId]);

  let extractedSomething = false;
  for (const key in fields) {
  const value = fields[key];
  const stringValue = typeof value === "string" ? value : String(value);

  if (key === 'photo' && (!stringValue || stringValue.trim() === '')) continue;

  if (stringValue.trim() !== '') {
    userIntakeOverrides[sessionId][key] = stringValue;
    extractedSomething = true;
  }
}


  console.log("[intakeExtractor] Smart-merged updated intake:", userIntakeOverrides[sessionId]);

  // Now run MonitorAI logic (only if something new was extracted)
  let monitorResult = { triggerUpload: false };
  if (extractedSomething) {
    const sessionMemory = {
    intakeData: userIntakeOverrides[sessionId],
    photoUploaded: userUploadedPhotos[sessionId]?.length > 0,
    photoRequested: userFlags[sessionId]?.photoRequested || false
  };

  monitorResult = await MonitorAI({
    conversation: userConversations[sessionId],
    intakeData: userIntakeOverrides[sessionId],
    sessionMemory,
    config: {
      photoField: "photo",
      photoRequired: true,
      generatePdfWithoutPhoto: true,
      completeMessage: "✅ All set! Ready to finalize your project summary.",
      photoPrompt: "📸 Upload a quick photo or tap skip to continue.",
      requiredFields: [
        "full_name",
        "email",
        "phone",
        "location",
        "goals",
        "square_footage",
        "must_have_features",
        "preferred_materials",
        "budget",
        "start_date",
        "final_notes"
      ]
    }
  });


// ✅ Normalize GPT reply if it returned { message: "..." }
if (typeof assistantReply === 'object' && assistantReply?.message) {
  assistantReply = assistantReply.message;
}

const responseData = { sessionId, reply: assistantReply };

if (monitorResult.triggerUpload) {
  console.log("📸 MonitorAI signaled to trigger photo upload.");
  responseData.triggerUpload = true;
}

if (monitorResult.showSummary) {
  responseData.show_summary = true;
}

if (monitorResult.nextStep === "escalate_to_human") {
  responseData.handoff = true;
}

res.status(200).json(responseData);

  }
});


// === Stripe Checkout Session Route ===
app.post('/create-checkout-session', async (req, res) => {
  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'subscription',
      line_items: [
        {
          price: 'price_1RMcneEDhetaP7L8rVlmhf8I', // Onboarding & Setup fee
          quantity: 1,
        },
        {
          price: 'price_1RMcbGEDhetaP7L8LTRSl42m', // Monthly Solo plan
          quantity: 1,
        }
      ],
      subscription_data: {
        trial_settings: {
          end_behavior: { missing_payment_method: 'cancel' }
        }
      },
      success_url: 'https://contact-solomon.onrender.com/success',
      cancel_url: 'https://contact-solomon.onrender.com/cancel',
    });

    res.json({ id: session.id });
  } catch (err) {
    console.error('❌ Stripe session error:', err.message);
    res.status(500).send('Failed to create checkout session');
  }
});

// ✅ Safe fallback until Stripe is fully implemented
async function hasUserPaid(sessionId) {
  return true; // Replace with real check when ready
}


// === Final Intake Submission Route ===
app.post('/submit-final-intake', async (req, res) => {
  const sessionId = req.headers['x-session-id'];
  if (!sessionId) return res.status(400).send("Missing session ID");
  ensureSession(sessionId);


  const intakeData = userIntakeOverrides[sessionId];
  if (intakeData.summary_submitted && intakeData.drive_file_id) {
    console.log("⚠️ Summary already submitted. Sending existing file ID:", intakeData.drive_file_id);
    return res.status(200).json({
      show_summary: true,
      drive_file_id: intakeData.drive_file_id,
      ...intakeData
    });
  }

  const hasUploadedPhotos = userUploadedPhotos[sessionId]?.length > 0;
  const photoFlag = intakeData?.photo;

  let requiredFields = adminConfig.requiredFields?.value || [];
  if (adminConfig.requirePhotoUpload?.enabled) {
    requiredFields.push("photo");
  }

  const missingFields = requiredFields.filter(field => {
    const value = intakeData[field];
    return !value || value.trim?.() === "";
  });

  if (missingFields.length > 0) {
    console.log("⚠️ Still missing fields:", missingFields);
    return res.status(200).json(intakeData); // triggers frontend prompt logic
  }

  // 💳 Stripe Enforcement
  if (adminConfig.enableStripeCheckout?.enabled) {
    if (typeof hasUserPaid === 'function') {
      const userPaid = await hasUserPaid(sessionId);
      if (!userPaid) {
        console.log("🚫 Stripe payment required before intake completion.");
        return res.status(403).json({ error: "Stripe payment required before completing intake." });
      }
    } else {
      console.warn("⚠️ Stripe toggle is enabled, but hasUserPaid() is not defined — skipping check safely.");
    }
  }


  console.log("[📸 Intake + Photo Complete] Submitting final summary (from confirmation route)...");

  const photos = userUploadedPhotos[sessionId] || [];

  let pdfBuffer;
  if (adminConfig.enablePdfGeneration?.enabled) {
    pdfBuffer = await generateSummaryPDF(intakeData, photos);
  }

  let uploaded;
  if (adminConfig.enableDriveUpload?.enabled && pdfBuffer) {
    uploaded = await uploadToDrive({
      fileName: `Garage-Quote-${sessionId}.pdf`,
      mimeType: 'application/pdf',
      buffer: pdfBuffer,
      folderId: process.env.GDRIVE_FOLDER_ID
    });
  }

  userIntakeOverrides[sessionId].summary_submitted = true;

  logClientActivity("default", "submit");


  return res.status(200).json({
    show_summary: true,
    drive_file_id: uploaded?.id,
    ...userIntakeOverrides[sessionId]
  });
});


// === Start server ===
app.listen(port, () => {
  console.log(`✅ Contact Solomon backend running on port ${port}`);
});
