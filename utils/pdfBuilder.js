
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

  function wrapText(text, maxWidth, font, fontSize) {
    const words = text.split(' ');
    const lines = [];
    let currentLine = '';

    for (let word of words) {
      const testLine = currentLine ? `${currentLine} ${word}` : word;
      const testWidth = font.widthOfTextAtSize(testLine, fontSize);

      if (testWidth < maxWidth) {
        currentLine = testLine;
      } else {
        lines.push(currentLine);
        currentLine = word;
      }
    }

    if (currentLine) lines.push(currentLine);
    return lines;
  }

  const page = createStyledPage();
  const { width, height } = page.getSize();

  // Draw logo
  if (logoImage) {
    const logoDims = logoImage.scale(0.15);
    page.drawImage(logoImage, {
      x: width / 2 - logoDims.width / 2,
      y: height - logoDims.height - 20,
      width: logoDims.width,
      height: logoDims.height,
    });
  }

  const headingColor = rgb(0.7, 0, 0);
  const labelColor = rgb(0.2, 0.2, 0.2);

  let y = height - 120;

  const drawTitle = (text) => {
    page.drawText(text, {
      x: width / 2 - 100,
      y,
      size: 20,
      font,
      color: headingColor
    });
    y -= 25;
  };

  const drawField = (label, value, xOffset = inch * 0.75) => {
    page.drawText(`${label}:`, { x: xOffset, y, font, size: 12, color: labelColor });
    y -= 14;
    const wrappedLines = wrapText(value || 'N/A', width / 2 - 90, font, fontSize);
    for (let line of wrappedLines) {
      page.drawText(line, { x: xOffset + 20, y, font, size: fontSize });
      y -= 14;
    }
    y -= 10;
  };

  drawTitle("Client Summary");
  page.drawText(`Session ID: ${data.session_id}`, {
    x: width / 2 - 100,
    y,
    font,
    size: 10,
    color: black
  });
  y -= 25;

  // Left Column Data
  const xLeft = inch * 0.75;
  y -= 10;
  drawField("Full Name", data.full_name, xLeft);
  drawField("Email", data.email, xLeft);
  drawField("Phone", data.phone, xLeft);
  drawField("Location", data.location, xLeft);
  drawField("Garage Goals", data.goals, xLeft);
  drawField("Square Footage", data.square_footage, xLeft);
  drawField("Must-Have Features", data.must_have_features, xLeft);
  drawField("Preferred Materials", data.preferred_materials, xLeft);
  drawField("Budget", data.budget, xLeft);
  drawField("Start Date", data.start_date, xLeft);
  drawField("Final Notes", data.final_notes, xLeft);

  // Right Column Notes
  const notes_x = width / 2 + 90;
  let notes_y = height - 140;
  page.drawText("Notes:", {
    x: notes_x,
    y: notes_y,
    font,
    size: 12,
    color: headingColor
  });
  notes_y -= 10;
  for (let i = 0; i < 10; i++) {
    notes_y -= 14;
    page.drawLine(notes_x, notes_y, width - inch * 0.75, notes_y);
  }

  // Footer
  page.drawText(`Session ID: ${data.session_id}`, {
    x: inch * 0.75,
    y: 40,
    size: 9,
    font,
    color: rgb(0.5, 0.5, 0.5),
  });
  page.drawText(`Contact: info@elevatedgarage.com | (208) 555-1234`, {
    x: inch * 0.75,
    y: 25,
    size: 9,
    font,
    color: rgb(0.5, 0.5, 0.5),
  });

  // Photos
  for (const file of photos) {
    const imgBytes = file.buffer;
    const img = file.mimetype === 'image/png'
      ? await pdfDoc.embedPng(imgBytes)
      : await pdfDoc.embedJpg(imgBytes);
    const imgPage = createStyledPage();
    imgPage.drawText("Uploaded Photo", {
      x: 50,
      y: imgPage.getHeight() - 40,
      size: fontSize + 1,
      font,
      color: headingColor,
    });

    const maxWidth = imgPage.getWidth() - 100;
    const maxHeight = imgPage.getHeight() - 140;
    const scaled = img.scale(1);
    let finalWidth = scaled.width;
    let finalHeight = scaled.height;

    if (finalWidth > maxWidth || finalHeight > maxHeight) {
      const scaleFactor = Math.min(maxWidth / finalWidth, maxHeight / finalHeight);
      finalWidth *= scaleFactor;
      finalHeight *= scaleFactor;
    }

    imgPage.drawImage(img, {
      x: (imgPage.getWidth() - finalWidth) / 2,
      y: (imgPage.getHeight() - finalHeight) / 2 - 20,
      width: finalWidth,
      height: finalHeight,
    });
  }

  const pdfBytes = await pdfDoc.save();
  return Buffer.from(pdfBytes);
}

module.exports = { generateSummaryPDF };
