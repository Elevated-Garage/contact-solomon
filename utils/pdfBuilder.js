const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
const fs = require('fs');
const path = require('path');

async function generateSummaryPDF(data, photos = []) {
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

  const logoBytes = fs.readFileSync(path.join(__dirname, '../public/assets/9.png'));
  const watermarkBytes = fs.readFileSync(path.join(__dirname, '../public/assets/Elevated Garage Icon Final.png'));
  const logoImg = await pdfDoc.embedPng(logoBytes);
  const watermarkImg = await pdfDoc.embedPng(watermarkBytes);

  const addFooterAndWatermark = (page) => {
    const { width, height } = page.getSize();
    const wmDims = watermarkImg.scale(0.5);

    page.drawImage(watermarkImg, {
      x: (width - wmDims.width) / 2,
      y: (height - wmDims.height) / 2,
      width: wmDims.width,
      height: wmDims.height,
      opacity: 0.05,
    });

    page.drawText("Phone: 208-625-1175    Web: elevatedgarage.com", {
      x: 50,
      y: 30,
      size: 10,
      font,
      color: rgb(0.5, 0.5, 0.5),
    });
  };

  // === First Page ===
  const page = pdfDoc.addPage();
  const { width, height } = page.getSize();
  addFooterAndWatermark(page);

  const logoDims = logoImg.scale(0.25);
  page.drawImage(logoImg, {
    x: 50,
    y: height - logoDims.height - 20,
    width: logoDims.width,
    height: logoDims.height,
  });

  let y = height - logoDims.height - 60;
  const fontSize = 12;

  const drawHeader = (title) => {
    page.drawText(title, {
      x: 50,
      y,
      size: fontSize + 2,
      font,
      color: rgb(0.71, 0.08, 0.13),
    });
    y -= 20;
  };

  const drawLine = (label, value) => {
    page.drawText(`${label}: ${value || 'N/A'}`, {
      x: 60,
      y,
      size: fontSize,
      font,
      color: rgb(0, 0, 0),
    });
    y -= 18;
  };

  drawHeader("Client Information");
  drawLine('Full Name', data.full_name);
  drawLine('Email', data.email);
  drawLine('Phone', data.phone);
  y -= 10;

  drawHeader("Garage Project Details");
  drawLine('Garage Goals', data.garage_goals);
  drawLine('Square Footage', data.square_footage);
  drawLine('Must-Have Features', data.must_have_features);
  drawLine('Budget', data.budget);
  drawLine('Preferred Start Date', data.start_date);
  drawLine('Final Notes', data.final_notes);

  // === Image Pages ===
  for (const file of photos) {
    const imgBytes = file.buffer;
    const image = file.mimetype === 'image/png'
      ? await pdfDoc.embedPng(imgBytes)
      : await pdfDoc.embedJpg(imgBytes);

    const imgPage = pdfDoc.addPage();
    const imgDims = image.scale(0.5);
    addFooterAndWatermark(imgPage);

    imgPage.drawText("Uploaded Photo", {
      x: 50,
      y: imgPage.getHeight() - 40,
      size: 14,
      font,
      color: rgb(0.71, 0.08, 0.13),
    });

    imgPage.drawImage(image, {
      x: 50,
      y: imgPage.getHeight() - imgDims.height - 60,
      width: imgDims.width,
      height: imgDims.height,
    });
  }

  const pdfBytes = await pdfDoc.save();
  return Buffer.from(pdfBytes);
}

module.exports = { generateSummaryPDF };

