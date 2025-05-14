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

  function drawHeaderWithLogo(page, logoImage) {
    if (!logoImage) return;
    const { width, height } = page.getSize();
    const logoDims = logoImage.scale(0.15);
    page.drawImage(logoImage, {
      x: width / 2 - logoDims.width / 2,
      y: height - logoDims.height - 20,
      width: logoDims.width,
      height: logoDims.height,
    });
    return height - logoDims.height - 50;
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

  let page = createStyledPage();
  const { width, height } = page.getSize();

  let y = drawHeaderWithLogo(page, logoImage) || height - 160;

  function checkPageSpace(requiredHeight = 60) {
  if (y < requiredHeight) {
    page = createStyledPage();
    y = drawHeaderWithLogo(page, logoImage) || height - 160;
  }
}

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

  
  const writeField = (label, value) => {
  const labelText = `${label}:`;
  const content = value || 'N/A';

  // Draw label
  page.drawText(labelText, {
    x: 50,
    y,
    size: fontSize,
    font,
    color: rgb(0.2, 0.2, 0.2)
  });
  y -= 16;
  checkPageSpace();

  // Manual word wrap (approximation)
  const maxWidth = width - 100;
  const wrappedLines = wrapText(content, maxWidth, font, fontSize);

  for (let line of wrappedLines) {
    checkPageSpace();
    page.drawText(line, {
      x: 70,
      y,
      size: fontSize,
      font
    });
    y -= 16;
  }

  y -= 8;
  checkPageSpace();
};


  writeSectionTitle("Client Information");
  writeField("Full Name", data.full_name);
  writeField("Email", data.email);
  writeField("Phone", data.phone);
  writeField("Location", data.location);

  writeSectionTitle("Garage Project Overview");
  writeField("Client Vision for the Garage", data.goals);
  writeField("Garage Dimensions", `${data.square_footage} sq ft`);
  writeField("Estimated Investment Range", `$${data.budget}`);

  writeSectionTitle("Key Requirements");
  writeField("Must-Have Features", data.must_have_features);
  writeField("Preferred Start Date", data.start_date);
  writeField("Preferred Materials", data.preferred_materials);
  writeField("Final Notes", data.final_notes);

  page.drawText(`Phone: ${data.phone || 'N/A'}   Web: elevatedgarage.com`, {
    x: 50,
    y: 30,
    size: 10,
    font,
    color: rgb(0.5, 0.5, 0.5),
  });

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
  color: rgb(0.7, 0, 0),
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
