const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
const fs = require('fs');
const path = require('path');

async function generateSummaryPDF(data, photos = []) {
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontSize = 12;

  const ASSET_PATH = path.join(__dirname, '../branding/ElevatedGarage');

  let logoImage, watermarkImage;

  try {
    const logoBytes = fs.readFileSync(path.join(ASSET_PATH, '9.png'));
    logoImage = await pdfDoc.embedPng(logoBytes);
  } catch (err) {
    console.warn("⚠️ Logo image missing — skipping logo.");
  }

  try {
    const watermarkBytes = fs.readFileSync(path.join(ASSET_PATH, 'Elevated Garage Icon Final.png'));
    watermarkImage = await pdfDoc.embedPng(watermarkBytes);
  } catch (err) {
    console.warn("⚠️ Watermark image missing — skipping watermark.");
  }

  const drawWatermark = (page) => {
    if (!watermarkImage) return;
    const { width, height } = page.getSize();
    const wmDims = watermarkImage.scale(0.5);
    page.drawImage(watermarkImage, {
      x: (width - wmDims.width) / 2,
      y: (height - wmDims.height) / 2,
      width: wmDims.width,
      height: wmDims.height,
      opacity: 0.06,
    });
  };

  const createStyledPage = () => {
    const page = pdfDoc.addPage();
    drawWatermark(page);
    return page;
  };

  const page = createStyledPage();
  const { width, height } = page.getSize();

  // Draw logo if present
  if (logoImage) {
    const logoDims = logoImage.scale(0.3);
    page.drawImage(logoImage, {
      x: width / 2 - logoDims.width / 2,
      y: height - logoDims.height - 40,
      width: logoDims.width,
      height: logoDims.height,
    });
  }

  let y = height - 160;

  const writeSectionTitle = (text) => {
    page.drawText(text, {
      x: 50,
      y,
      size: fontSize + 1,
      font,
      color: rgb(0.7, 0, 0),
    });
    y -= 20;
  };

  const writeField = (label, value) => {
    page.drawText(`${label}:`, {
      x: 50,
      y,
      size: fontSize,
      font,
      color: rgb(0.2, 0.2, 0.2)
    });
    y -= 16;
    page.drawText(value || 'N/A', {
      x: 70,
      y,
      size: fontSize,
      font
    });
    y -= 24;
  };

  writeSectionTitle("Client Information");
  writeField("Full Name", data.full_name);
  writeField("Email", data.email);
  writeField("Phone", data.phone);

  writeSectionTitle("Garage Project Overview");
  writeField("Client Vision for the Garage", data.garage_goals);
  writeField("Garage Dimensions", `${data.square_footage} sq ft`);
  writeField("Estimated Investment Range", `$${data.budget}`);

  writeSectionTitle("Key Requirements");
  writeField("Must-Have Features", data.must_have_features);
  writeField("Preferred Start Date", data.start_date);
  writeField("Final Notes", data.final_notes);

  page.drawText(`Phone: ${data.phone || 'N/A'}   Web: elevatedgarage.com`, {
    x: 50,
    y: 30,
    size: 10,
    font,
    color: rgb(0.5, 0.5, 0.5),
  });

  // Add photos
  for (const file of photos) {
    const imgBytes = file.buffer;
    const img = file.mimetype === 'image/png'
      ? await pdfDoc.embedPng(imgBytes)
      : await pdfDoc.embedJpg(imgBytes);
    const imgPage = createStyledPage();
    const imgDims = img.scale(0.5);
    imgPage.drawText("Uploaded Photo", {
      x: 50,
      y: imgPage.getHeight() - 40,
      size: fontSize + 1,
      font,
      color: rgb(0.7, 0, 0),
    });
    imgPage.drawImage(img, {
      x: 50,
      y: imgPage.getHeight() - imgDims.height - 80,
      width: imgDims.width,
      height: imgDims.height,
    });
  }

  const pdfBytes = await pdfDoc.save();
  return Buffer.from(pdfBytes);
}

module.exports = { generateSummaryPDF };
