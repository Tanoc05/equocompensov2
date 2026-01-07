const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function generateCalculationPdf({ filePath, user, calculation, result }) {
  ensureDir(path.dirname(filePath));

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50, autoFirstPage: true, bufferPages: true });
    const stream = fs.createWriteStream(filePath);

    doc.pipe(stream);

    const primary = '#1A535C';
    const brandName = 'equo compenso';

    const input = (calculation && calculation.input_json) ? calculation.input_json : {};
    const nomePratica = input && input.nome_pratica ? String(input.nome_pratica) : '';
    const clienteNome = input && input.cliente_nome ? String(input.cliente_nome) : '';
    const createdAt = calculation && calculation.created_at ? new Date(calculation.created_at) : new Date();

    function fontRegular() {
      doc.font('Helvetica');
    }

    function fontBold() {
      doc.font('Helvetica-Bold');
    }

    function currency(v) {
      if (v == null) return '';
      if (typeof v === 'number') {
        return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(v);
      }
      const s = String(v);
      return s.includes('€') ? s : s;
    }

    function drawHeader() {
      const y = doc.y;
      const logoPath = path.resolve(__dirname, '../../../frontend/img/logo2.png');
      try {
        if (fs.existsSync(logoPath)) {
          doc.image(logoPath, doc.page.margins.left, y, { fit: [120, 36] });
        }
      } catch {
        // ignore
      }

      fontBold();
      doc.fontSize(14).fillColor('#111');
      doc.text(brandName, doc.page.margins.left, y + 8, {
        width: doc.page.width - doc.page.margins.left - doc.page.margins.right,
        align: 'right',
      });

      const lineY = y + 44;
      doc.save();
      doc.moveTo(doc.page.margins.left, lineY)
        .lineTo(doc.page.width - doc.page.margins.right, lineY)
        .lineWidth(2)
        .strokeColor(primary)
        .stroke();
      doc.restore();
      doc.moveDown(2);
    }

    function sectionTitle(title) {
      fontBold();
      doc.fontSize(12).fillColor('#111').text(title);
      doc.moveDown(0.5);
      fontRegular();
    }

    function keyValueRow(label, value) {
      const leftW = 160;
      const startX = doc.page.margins.left;
      const maxW = doc.page.width - doc.page.margins.left - doc.page.margins.right;
      const y = doc.y;

      fontBold();
      doc.fontSize(10).fillColor('#111').text(label, startX, y, { width: leftW });
      fontRegular();
      doc.fillColor('#111').text(value || '-', startX + leftW, y, { width: maxW - leftW });
      doc.moveDown(0.6);
    }

    function drawZebraTable({ columns, rows }) {
      const startX = doc.page.margins.left;
      const tableW = doc.page.width - doc.page.margins.left - doc.page.margins.right;
      const colW = [0.36, 0.42, 0.22].map(p => p * tableW);
      const rowH = 22;

      // Header
      const headerY = doc.y;
      doc.save();
      doc.rect(startX, headerY, tableW, rowH).fill('#F4F7F6');
      doc.restore();

      fontBold();
      doc.fontSize(10).fillColor('#111');
      doc.text(columns[0], startX + 8, headerY + 6, { width: colW[0] - 16 });
      doc.text(columns[1], startX + colW[0] + 8, headerY + 6, { width: colW[1] - 16 });
      doc.text(columns[2], startX + colW[0] + colW[1] + 8, headerY + 6, { width: colW[2] - 16, align: 'right' });
      doc.moveDown();

      // Rows
      let y = headerY + rowH;
      rows.forEach((r, idx) => {
        const isAlt = idx % 2 === 0;
        doc.save();
        doc.rect(startX, y, tableW, rowH).fill(isAlt ? '#FFFFFF' : '#FAFAFA');
        doc.restore();

        fontRegular();
        doc.fontSize(10).fillColor('#111');
        doc.text(r[0], startX + 8, y + 6, { width: colW[0] - 16 });
        doc.text(r[1], startX + colW[0] + 8, y + 6, { width: colW[1] - 16 });
        fontBold();
        doc.text(r[2], startX + colW[0] + colW[1] + 8, y + 6, { width: colW[2] - 16, align: 'right' });
        y += rowH;

        // Auto page break
        if (y > doc.page.height - doc.page.margins.bottom - 80) {
          doc.addPage();
          drawHeader();
          y = doc.y;
        }
      });

      doc.y = y + 12;
    }

    function drawFooter(pageNumber, pageCount) {
      const footerY = doc.page.height - doc.page.margins.bottom + 8;
      const startX = doc.page.margins.left;
      const maxW = doc.page.width - doc.page.margins.left - doc.page.margins.right;

      doc.save();
      fontRegular();
      doc.fontSize(8).fillColor('#333');
      doc.text('Il presente documento attesta la conformità della prestazione professionale ai sensi della Legge 49/2023.', startX, footerY - 22, { width: maxW, align: 'left' });
      doc.text(`${pageNumber}/${pageCount}`, startX, footerY - 8, { width: maxW, align: 'center' });
      doc.restore();
    }

    // Collect pages to add footer after content
    const pages = [];
    doc.on('pageAdded', () => {
      pages.push(doc.bufferedPageRange().start + pages.length);
    });

    // Initial page capture
    pages.push(0);

    drawHeader();

    sectionTitle('RIEPILOGO PRATICA');
    keyValueRow('Nome Pratica', nomePratica);
    keyValueRow('Cliente/Società', clienteNome);
    keyValueRow('Data Generazione', createdAt.toLocaleString('it-IT'));

    doc.moveDown(0.6);

    sectionTitle('TABELLA CALCOLO');

    const inputCorr = input && input.corrispettivoPattuito != null && !Number.isNaN(input.corrispettivoPattuito)
      ? currency(input.corrispettivoPattuito)
      : '-';
    const inputPct = input && input.percentuale != null && !Number.isNaN(input.percentuale)
      ? `${input.percentuale}%`
      : '-';

    const rows = [
      ['Corrispettivo pattuito', 'Valore inserito', inputCorr],
      ['Parametro di riferimento ministeriale', `Criterio: ${calculation.criterio}`, String(result.chosen || '-')],
      ['Percentuale applicata', 'Adeguamento', inputPct],
      ['TOTALE EQUO COMPENSO', 'Importo finale', String(result.compenso_pattuito || result.chosen || '-')],
    ];

    drawZebraTable({
      columns: ['Voce', 'Dettaglio', 'Importo (€)'],
      rows,
    });

    // Apply footer + pagination to each buffered page
    const range = doc.bufferedPageRange();
    const pageCount = range.count;
    for (let i = 0; i < pageCount; i++) {
      doc.switchToPage(i);
      drawFooter(i + 1, pageCount);
    }

    doc.end();

    stream.on('finish', resolve);
    stream.on('error', reject);
  });
}

module.exports = { generateCalculationPdf };
