const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function generateCalculationPdf({ filePath, user, calculation, result }) {
  ensureDir(path.dirname(filePath));

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const stream = fs.createWriteStream(filePath);

    doc.pipe(stream);

    doc.fontSize(18).text('Documento Compenso (Equo Compenso)', { align: 'left' });
    doc.moveDown(0.5);

    doc.fontSize(11).fillColor('#333');
    doc.text(`Utente: ${user.nome} ${user.cognome}`);
    doc.text(`Email: ${user.email}`);
    doc.text(`Professione: ${user.professione}`);
    doc.moveDown();

    doc.fontSize(12).fillColor('#1C4D8D').text('Dettagli calcolo');
    doc.fillColor('#333').fontSize(11);
    doc.text(`Riquadro: ${calculation.riquadro}`);
    doc.text(`Criterio: ${calculation.criterio}`);
    doc.text(`Data: ${new Date(calculation.created_at).toLocaleString('it-IT')}`);
    doc.moveDown();

    doc.fontSize(12).fillColor('#1C4D8D').text('Risultato');
    doc.fillColor('#333').fontSize(11);
    doc.text(`Min: ${result.min}`);
    doc.text(`Medio: ${result.mid}`);
    doc.text(`Max: ${result.max}`);
    doc.text(`Scelto: ${result.chosen}`);

    if (Array.isArray(result.details) && result.details.length) {
      doc.moveDown();
      doc.fontSize(12).fillColor('#1C4D8D').text('Dettagli');
      doc.fillColor('#333').fontSize(11);
      result.details.forEach(d => doc.text(`- ${d}`));
    }

    doc.end();

    stream.on('finish', resolve);
    stream.on('error', reject);
  });
}

module.exports = { generateCalculationPdf };
