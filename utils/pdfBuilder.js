const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');

async function generateSummaryPDF(data) {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage();
  const { width, height } = page.getSize();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontSize = 12;
  let y = height - 50;

  const drawLine = (label, value) => {
    page.drawText(`${label}: ${value || 'N/A'}`, {
      x: 50,
      y,
      size: fontSize,
      font,
      color: rgb(0, 0, 0),
    });
    y -= 20;
  };

  drawLine('Full Name', data.full_name);
  drawLine('Email', data.email);
  drawLine('Phone', data.phone);
  drawLine('Garage Goals', data.garage_goals);
  drawLine('Square Footage', data.square_footage);
  drawLine('Must-Have Features', data.must_have_features);
  drawLine('Budget', data.budget);
  drawLine('Preferred Start Date', data.start_date);
  drawLine('Final Notes', data.final_notes);

  const pdfBytes = await pdfDoc.save();
  return Buffer.from(pdfBytes);
}

module.exports = { generateSummaryPDF };
