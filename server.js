const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const multer = require("multer");
const PDFDocument = require("pdfkit");
const { google } = require("googleapis");
const { OpenAI } = require("openai");

require("dotenv").config();
const app = express();
const port = process.env.PORT || 10000;
const upload = multer({ dest: "uploads/" });
app.use(cors());
app.use(bodyParser.json({ limit: "10mb" }));
app.use(bodyParser.urlencoded({ extended: true }));

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const auth = new google.auth.GoogleAuth({
  credentials: {
    client_email: process.env.GDRIVE_CLIENT_EMAIL,
    private_key: process.env.GDRIVE_PRIVATE_KEY.replace(/\\n/g, '\n'),
  },
  scopes: ["https://www.googleapis.com/auth/drive.file"]
});
const drive = google.drive({ version: "v3", auth });

async function generateSummaryPDF(summaryText, imagePath, pdfPath) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument();
    const stream = fs.createWriteStream(pdfPath);
    doc.pipe(stream);

    const logoPath = path.join(__dirname, "assets", "logo.png");
    const watermarkPath = path.join(__dirname, "assets", "watermark.png");

    if (fs.existsSync(logoPath)) {
      doc.image(logoPath, 220, 60, { width: 160 });
    }

    doc.moveDown(4);
    doc.font("Helvetica-Bold").fontSize(16).text("ELEVATED GARAGE PROJECT SUMMARY", {
      align: "center",
      underline: true
    });

    doc.moveDown(2);
    if (fs.existsSync(watermarkPath)) {
      doc.image(watermarkPath, 150, 200, { width: 300, opacity: 0.1 });
    }

    summaryText.split("\n").forEach(line => {
      const [label, ...value] = line.split(":");
      if (label && value.length) {
        doc.font("Helvetica-Bold").text(label.trim().toUpperCase() + ":");
        doc.font("Helvetica").text(value.join(":").trim());
        doc.moveDown();
      }
    });

    if (imagePath && fs.existsSync(imagePath)) {
      doc.addPage();
      doc.font("Helvetica-Bold").text("GARAGE PHOTO (IF AVAILABLE):");
      doc.moveDown(2);
      doc.image(imagePath, {
        fit: [500, 300],
        align: "center"
      });
    }

    doc.end();
    stream.on("finish", resolve);
    stream.on("error", reject);
  });
}

app.post("/message", async (req, res) => {
  try {
    const userMessage = req.body.message;
    const imageData = req.body.images?.[0];

    const completion = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [
        { role: "system", content: "Extract and format summary info for a garage design intake form." },
        { role: "user", content: userMessage }
      ],
      temperature: 0.5
    });

    const aiReply = completion.choices[0].message.content;
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");

    const summaryPath = path.join(__dirname, `summary-${timestamp}.pdf`);
    const photoPath = imageData ? path.join(__dirname, `garage-${timestamp}.jpg`) : null;

    if (imageData) {
      const base64Data = imageData.replace(/^data:image\/\w+;base64,/, "");
      fs.writeFileSync(photoPath, base64Data, "base64");
    }

    await generateSummaryPDF(aiReply, photoPath, summaryPath);

    const summaryUpload = await drive.files.create({
      requestBody: { name: `Garage Project Summary - ${timestamp}.pdf`, mimeType: "application/pdf" },
      media: { mimeType: "application/pdf", body: fs.createReadStream(summaryPath) }
    });
    fs.unlinkSync(summaryPath);

    if (photoPath) {
      await drive.files.create({
        requestBody: { name: `Garage Photo - ${timestamp}.jpg`, mimeType: "image/jpeg" },
        media: { mimeType: "image/jpeg", body: fs.createReadStream(photoPath) }
      });
      fs.unlinkSync(photoPath);
    }

    res.json({ reply: aiReply });
  } catch (err) {
    console.error("❌ Server error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.listen(port, () => {
  console.log(`✅ Contact Solomon backend running on port ${port}`);
});
