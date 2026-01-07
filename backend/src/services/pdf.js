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

    function toNumber(v) {
      if (v == null) return NaN;
      if (typeof v === 'number') return v;
      const s = String(v).replace(/\./g, '').replace(',', '.');
      const n = Number(s);
      return Number.isFinite(n) ? n : NaN;
    }

    function tierSpan(value, from, to) {
      if (!Number.isFinite(value)) return 0;
      const upper = (to === Infinity) ? value : Math.min(value, to);
      const span = Math.max(0, upper - from);
      return span;
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
      doc.rect(startX, headerY, tableW, rowH).fill(primary);
      doc.restore();

      fontBold();
      doc.fontSize(10).fillColor('#FFFFFF');
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
      doc.text(
        'Il presente documento attesta la conformità della prestazione professionale ai sensi della Legge 49/2023.\n' +
          "Il calcolo è generato in conformità ai parametri del D.M. 140/2012 e successive integrazioni sull'Equo Compenso.",
        startX,
        footerY - 30,
        { width: maxW, align: 'left' }
      );
      doc.text(`${pageNumber}/${pageCount}`, startX, footerY - 8, { width: maxW, align: 'center' });
      doc.restore();
    }

    function normativeReferenceFor(riquadro, docType) {
      const map = {
        r1: 'Art. 19 - Amministrazione e custodia di aziende | Tabella C, Riquadro 1 (Dottori Commercialisti)',
        r2: 'Art. 20 - Liquidazione di aziende | Tabella C, Riquadro 2 (Dottori Commercialisti)',
        r3: 'Art. 21 - Perizie, valutazioni e pareri motivati | Tabella C, Riquadro 3 (Dottori Commercialisti)',
        r4: 'Art. 22 - Revisioni contabili | Tabella C, Riquadro 4 (Dottori Commercialisti)',
        r5_1: 'Art. 23 comma 1 - Tenuta contabilità ordinaria | Tabella C, Riquadro 5.1 (Dottori Commercialisti)',
        r5_2: 'Art. 23 comma 2 - Contabilità semplificata | Tabella C, Riquadro 5.2 (Dottori Commercialisti)',
        r7_1: 'Art. 25 comma 1 - Costituzione e variazioni statuto | Tabella C, Riquadro 7.1 (Dottori Commercialisti)',
        r7_2: 'Art. 25 comma 2 - Fusioni, scissioni e operazioni straordinarie | Tabella C, Riquadro 7.2 (Dottori Commercialisti)',
        r8_1: 'Art. 26 comma 1 - Consulenza contrattuale | Tabella C, Riquadro 8.1 (Dottori Commercialisti)',
        r9: 'Art. 27 - Assistenza in procedure concorsuali | Tabella C, Riquadro 9 (Dottori Commercialisti)',
        r10_1: 'Art. 28 comma 1 - Assistenza tributaria (Dichiarazioni) | Tabella C, Riquadro 10.1 (Dottori Commercialisti)',
        r10_2: 'Art. 28 comma 2 - Rappresentanza tributaria | Tabella C, Riquadro 10.2 (Dottori Commercialisti)',
        r10_3: 'Art. 28 comma 3 - Consulenza tributaria | Tabella C, Riquadro 10.3 (Dottori Commercialisti)',
        r11: 'Art. 29 - Collegio Sindacale | Tabella C, Riquadro 11 (Dottori Commercialisti)',
      };

      if (riquadro === 'r8_2') {
        if (docType === 'consulenza_finanziamenti' || docType === 'consulente_finanziamento') {
          return 'Art. 26 comma 2 - Consulenza su finanziamenti | Tabella C, Riquadro 8.2 (Dottori Commercialisti)';
        }
        if (docType === 'consulente_economico_finanziaria') {
          return 'Art. 26 comma 3 - Consulenza economica-finanziaria | Tabella C, Riquadro 8.2 (Dottori Commercialisti)';
        }
        return 'Art. 26 - Consulenze (comma 2/3) | Tabella C, Riquadro 8.2 (Dottori Commercialisti)';
      }

      return map[riquadro] || `Tabella C, ${riquadro || 'Riquadro N/D'} (Dottori Commercialisti)`;
    }

    function methodologyData({ riquadro, input, criterio, result }) {
      const mods = [];
      const inputRows = [];
      const scaglioniRows = [];

      const v1 = toNumber(input && input.valore);
      const v2 = toNumber(input && input.valore2);
      const v3 = toNumber(input && input.valore3);

      if (Number.isFinite(v1)) inputRows.push(['Valore', 'Valore di riferimento', currency(v1)]);
      if (Number.isFinite(v2)) inputRows.push(['Valore 2', 'Secondo valore', currency(v2)]);
      if (Number.isFinite(v3)) inputRows.push(['Valore 3', 'Terzo valore', currency(v3)]);

      const a1 = toNumber(input && input.aliquota_scaglione_1);
      const a2 = toNumber(input && input.aliquota_scaglione_2);
      if (Number.isFinite(a1)) inputRows.push(['Aliquota fascia 1', 'Valore selezionato', `${(a1 * 100).toFixed(2)}%`]);
      if (Number.isFinite(a2)) inputRows.push(['Aliquota fascia 2', 'Valore selezionato', `${(a2 * 100).toFixed(2)}%`]);

      const i1 = input && input.intensity_scaglione_1 ? String(input.intensity_scaglione_1) : '';
      const i2 = input && input.intensity_scaglione_2 ? String(input.intensity_scaglione_2) : '';
      if (i1) inputRows.push(['Intensità fascia 1', 'Selezione utente', i1]);
      if (i2) inputRows.push(['Intensità fascia 2', 'Selezione utente', i2]);

      const aCons = toNumber(input && input.aliquota_consulenza);
      if (Number.isFinite(aCons)) inputRows.push(['Aliquota consulenza', 'Valore selezionato', `${(aCons * 100).toFixed(2)}%`]);
      if (input && input.percentuale != null && !Number.isNaN(input.percentuale)) inputRows.push(['Percentuale', 'Posizionamento nel range (0%=min, 100%=max)', `${input.percentuale}%`]);
      if (input && input.corrispettivoPattuito != null && !Number.isNaN(input.corrispettivoPattuito)) inputRows.push(['Corrispettivo pattuito', 'Valore inserito', currency(input.corrispettivoPattuito)]);
      if (criterio) inputRows.push(['Criterio', 'Selezione valore', String(criterio)]);

      if (riquadro === 'r10_1') {
        const fixed = {
          pf_no_piva: 150,
          pf_piva: 450,
          soc_persone: 550,
          soc_capitali: 650,
          irap: 200,
          iva: 250,
          sostituti: 150,
          successione: 350,
          altre: 100,
          invio: 20,
        };
        const labels = {
          pf_no_piva: 'Redditi Persone Fisiche (no P.IVA)',
          pf_piva: 'Redditi Persone Fisiche con P.IVA',
          soc_persone: 'Redditi Società di Persone',
          soc_capitali: 'Redditi Società di Capitali',
          irap: 'Dichiarazione IRAP',
          iva: 'Dichiarazione IVA',
          sostituti: "Sostituti d'Imposta",
          successione: 'Dichiarazione di Successione',
          altre: 'Altre comunicazioni/dichiarazioni',
          invio: 'Invio Telematico (per singola voce)',
        };

        const selected = (input && Array.isArray(input.dichiarazioniMulti)) ? input.dichiarazioniMulti : [];
        inputRows.push(['Voci selezionate', 'Conteggio', String(selected.length)]);

        let total = 0;
        selected.forEach((id) => {
          const fee = fixed[id];
          if (Number.isFinite(fee)) {
            total += fee;
            scaglioniRows.push(['Voce', labels[id] || id, currency(fee)]);
          }
        });

        scaglioniRows.push(['Totale', 'Somma tariffe fisse', currency(total)]);
        mods.push('Calcolo a tariffe fisse: somma delle voci selezionate.');
      }

      if (riquadro === 'r9') {
        const s1 = tierSpan(v1, 0, 1000000);
        const s2 = tierSpan(v1, 1000000, Infinity);
        const min1 = s1 * 0.01;
        const max1 = s1 * 0.02;
        const min2 = s2 * 0.007;
        const max2 = s2 * 0.009;
        scaglioniRows.push(['Fascia 1', `Fino a 1.000.000 € | Quota: ${currency(s1)} | Aliquota: 1,00% - 2,00%`, `${currency(min1)} / ${currency(max1)}`]);
        scaglioniRows.push(['Fascia 2', `Oltre 1.000.000 € | Quota: ${currency(s2)} | Aliquota: 0,70% - 0,90%`, `${currency(min2)} / ${currency(max2)}`]);
        if (input && input.esitoNegativo) mods.push('Riduzione: esito negativo (-50%).');
      }

      if (riquadro === 'r1') {
        const base = Number.isFinite(v2) ? (v1 + v2) : v1;
        const s1 = tierSpan(base, 0, 10000);
        const s2 = tierSpan(base, 10000, 50000);
        const s3 = tierSpan(base, 50000, Infinity);
        scaglioniRows.push(['Fascia 1', `Fino a 10.000 € | Quota: ${currency(s1)} | Aliquota: 3,00% - 4,00%`, `${currency(s1 * 0.03)} / ${currency(s1 * 0.04)}`]);
        scaglioniRows.push(['Fascia 2', `Da 10.000 a 50.000 € | Quota: ${currency(s2)} | Aliquota: 2,00% - 3,00%`, `${currency(s2 * 0.02)} / ${currency(s2 * 0.03)}`]);
        scaglioniRows.push(['Fascia 3', `Oltre 50.000 € | Quota: ${currency(s3)} | Aliquota: 1,00% - 2,00%`, `${currency(s3 * 0.01)} / ${currency(s3 * 0.02)}`]);
      }

      if (riquadro === 'r2') {
        const attivo = Number.isFinite(v1) ? v1 : 0;
        const passivo = Number.isFinite(v2) ? v2 : 0;

        const a1 = tierSpan(attivo, 0, 400000);
        const a2 = tierSpan(attivo, 400000, 4000000);
        const a3 = tierSpan(attivo, 4000000, Infinity);

        const attMin1 = a1 * 0.04;
        const attMax1 = a1 * 0.06;
        const attMin2 = a2 * 0.02;
        const attMax2 = a2 * 0.03;
        const attMin3 = a3 * 0.0075;
        const attMax3 = a3 * 0.01;

        const passMin = passivo * 0.0075;
        const passMax = passivo * 0.01;

        const minTot = attMin1 + attMin2 + attMin3 + passMin;
        const maxTot = attMax1 + attMax2 + attMax3 + passMax;

        scaglioniRows.push(['Attivo 1', `Fino a 400.000 € | Quota: ${currency(a1)} | Aliquota: 4,00% - 6,00%`, `${currency(attMin1)} / ${currency(attMax1)}`]);
        scaglioniRows.push(['Attivo 2', `Da 400.000 a 4.000.000 € | Quota: ${currency(a2)} | Aliquota: 2,00% - 3,00%`, `${currency(attMin2)} / ${currency(attMax2)}`]);
        scaglioniRows.push(['Attivo 3', `Oltre 4.000.000 € | Quota: ${currency(a3)} | Aliquota: 0,75% - 1,00%`, `${currency(attMin3)} / ${currency(attMax3)}`]);
        scaglioniRows.push(['Passivo', `Sul totale passivo accertato: ${currency(passivo)} | Aliquota: 0,75% - 1,00%`, `${currency(passMin)} / ${currency(passMax)}`]);
        scaglioniRows.push(['Totale', 'Somma attivo + passivo', `${currency(minTot)} / ${currency(maxTot)}`]);
      }

      if (riquadro === 'r3') {
        const base = Number.isFinite(v1) ? v1 : 0;
        const s1 = tierSpan(base, 0, 1000000);
        const s2 = tierSpan(base, 1000000, 3000000);
        const s3 = tierSpan(base, 3000000, Infinity);

        const min1 = s1 * 0.008;
        const max1 = s1 * 0.01;
        const min2 = s2 * 0.005;
        const max2 = s2 * 0.007;
        const min3 = s3 * 0.00025;
        const max3 = s3 * 0.0005;

        const minTot = min1 + min2 + min3;
        const maxTot = max1 + max2 + max3;

        scaglioniRows.push(['Fascia 1', `Fino a 1.000.000 € | Quota: ${currency(s1)} | Aliquota: 0,80% - 1,00%`, `${currency(min1)} / ${currency(max1)}`]);
        scaglioniRows.push(['Fascia 2', `Da 1.000.000 a 3.000.000 € | Quota: ${currency(s2)} | Aliquota: 0,50% - 0,70%`, `${currency(min2)} / ${currency(max2)}`]);
        scaglioniRows.push(['Fascia 3', `Oltre 3.000.000 € | Quota: ${currency(s3)} | Aliquota: 0,025% - 0,050%`, `${currency(min3)} / ${currency(max3)}`]);
        scaglioniRows.push(['Totale', 'Somma fasce', `${currency(minTot)} / ${currency(maxTot)}`]);
      }

      if (riquadro === 'r4') {
        const redditoMin = v1 * 0.001;
        const redditoMax = v1 * 0.0015;
        const attivitaMin = v2 * 0.0005;
        const attivitaMax = v2 * 0.00075;
        const passivitaMin = v3 * 0.0005;
        const passivitaMax = v3 * 0.00075;

        const minTot = redditoMin + attivitaMin + passivitaMin;
        const maxTot = redditoMax + attivitaMax + passivitaMax;

        scaglioniRows.push(['A) Reddito', `Base: ${currency(v1)} | Aliquota: 0,10% - 0,15%`, `${currency(redditoMin)} / ${currency(redditoMax)}`]);
        scaglioniRows.push(['B) Attività', `Base: ${currency(v2)} | Aliquota: 0,050% - 0,075%`, `${currency(attivitaMin)} / ${currency(attivitaMax)}`]);
        scaglioniRows.push(['C) Passività', `Base: ${currency(v3)} | Aliquota: 0,050% - 0,075%`, `${currency(passivitaMin)} / ${currency(passivitaMax)}`]);
        scaglioniRows.push(['Totale', 'Somma delle tre componenti', `${currency(minTot)} / ${currency(maxTot)}`]);
      }

      if (riquadro === 'r5_1') {
        const redditoMin = v1 * 0.003;
        const redditoMax = v1 * 0.005;
        const attivitaMin = v2 * 0.0002;
        const attivitaMax = v2 * 0.0006;
        const passivitaMin = v3 * 0.0002;
        const passivitaMax = v3 * 0.00065;

        const minTot = redditoMin + attivitaMin + passivitaMin;
        const maxTot = redditoMax + attivitaMax + passivitaMax;

        scaglioniRows.push(['A) Reddito', `Base: ${currency(v1)} | Aliquota: 0,30% - 0,50%`, `${currency(redditoMin)} / ${currency(redditoMax)}`]);
        scaglioniRows.push(['B) Attività', `Base: ${currency(v2)} | Aliquota: 0,020% - 0,060%`, `${currency(attivitaMin)} / ${currency(attivitaMax)}`]);
        scaglioniRows.push(['C) Passività', `Base: ${currency(v3)} | Aliquota: 0,020% - 0,065%`, `${currency(passivitaMin)} / ${currency(passivitaMax)}`]);
        scaglioniRows.push(['Totale', 'Somma delle tre componenti', `${currency(minTot)} / ${currency(maxTot)}`]);
      }

      if (riquadro === 'r5_2') {
        const base = Number.isFinite(v1) ? v1 : 0;
        const s1 = tierSpan(base, 0, 50000);
        const s2 = tierSpan(base, 50000, 100000);
        const s3 = tierSpan(base, 100000, Infinity);

        const min1 = s1 * 0.03;
        const max1 = s1 * 0.04;
        const min2 = s2 * 0.01;
        const max2 = s2 * 0.02;
        const min3 = s3 * 0.005;
        const max3 = s3 * 0.01;

        const minTot = min1 + min2 + min3;
        const maxTot = max1 + max2 + max3;

        scaglioniRows.push(['Fascia 1', `Fino a 50.000 € | Quota: ${currency(s1)} | Aliquota: 3,00% - 4,00%`, `${currency(min1)} / ${currency(max1)}`]);
        scaglioniRows.push(['Fascia 2', `Da 50.000 a 100.000 € | Quota: ${currency(s2)} | Aliquota: 1,00% - 2,00%`, `${currency(min2)} / ${currency(max2)}`]);
        scaglioniRows.push(['Fascia 3', `Oltre 100.000 € | Quota: ${currency(s3)} | Aliquota: 0,50% - 1,00%`, `${currency(min3)} / ${currency(max3)}`]);
        scaglioniRows.push(['Totale', 'Somma fasce', `${currency(minTot)} / ${currency(maxTot)}`]);
      }

      if (riquadro === 'r7_1') {
        const base = Number.isFinite(v1) ? v1 : 0;
        const s1 = tierSpan(base, 0, 1000000);
        const s2 = tierSpan(base, 1000000, 15000000);
        const s3 = tierSpan(base, 15000000, Infinity);

        const min1 = s1 * 0.0075;
        const max1 = s1 * 0.015;
        const min2 = s2 * 0.005;
        const max2 = s2 * 0.0075;
        const min3 = s3 * 0.0025;
        const max3 = s3 * 0.005;

        const minTot = min1 + min2 + min3;
        const maxTot = max1 + max2 + max3;

        scaglioniRows.push(['Fascia 1', `Fino a 1.000.000 € | Quota: ${currency(s1)} | Aliquota: 0,75% - 1,50%`, `${currency(min1)} / ${currency(max1)}`]);
        scaglioniRows.push(['Fascia 2', `Da 1.000.000 a 15.000.000 € | Quota: ${currency(s2)} | Aliquota: 0,50% - 0,75%`, `${currency(min2)} / ${currency(max2)}`]);
        scaglioniRows.push(['Fascia 3', `Oltre 15.000.000 € | Quota: ${currency(s3)} | Aliquota: 0,25% - 0,50%`, `${currency(min3)} / ${currency(max3)}`]);
        scaglioniRows.push(['Totale', 'Somma fasce', `${currency(minTot)} / ${currency(maxTot)}`]);
      }

      if (riquadro === 'r7_2') {
        const base = Number.isFinite(v1) ? v1 : 0;
        const s1 = tierSpan(base, 0, 4000000);
        const s2 = tierSpan(base, 4000000, Infinity);

        const min1 = s1 * 0.01;
        const max1 = s1 * 0.015;
        const min2 = s2 * 0.005;
        const max2 = s2 * 0.01;

        const minTot = min1 + min2;
        const maxTot = max1 + max2;

        scaglioniRows.push(['Fascia 1', `Fino a 4.000.000 € | Quota: ${currency(s1)} | Aliquota: 1,00% - 1,50%`, `${currency(min1)} / ${currency(max1)}`]);
        scaglioniRows.push(['Fascia 2', `Oltre 4.000.000 € | Quota: ${currency(s2)} | Aliquota: 0,50% - 1,00%`, `${currency(min2)} / ${currency(max2)}`]);
        scaglioniRows.push(['Totale', 'Somma fasce', `${currency(minTot)} / ${currency(maxTot)}`]);
      }

      if (riquadro === 'r8_2') {
        const s1 = tierSpan(v1, 0, 2000000);
        const s2 = tierSpan(v1, 2000000, Infinity);

        function rateFromIntensity(minRate, maxRate, intensity) {
          if (intensity === 'min') return minRate;
          if (intensity === 'max') return maxRate;
          return (minRate + maxRate) / 2;
        }

        if (i1 && i2) {
          const r1 = rateFromIntensity(0.0075, 0.01, i1);
          const r2 = rateFromIntensity(0.005, 0.0075, i2);
          scaglioniRows.push(['Fascia 1', `Fino a 2.000.000 € | Quota: ${currency(s1)} | Aliquota: ${(r1 * 100).toFixed(2)}%`, currency(s1 * r1)]);
          scaglioniRows.push(['Fascia 2', `Oltre 2.000.000 € | Quota: ${currency(s2)} | Aliquota: ${(r2 * 100).toFixed(2)}%`, currency(s2 * r2)]);
          mods.push('Intensità per scaglione applicata (min/medio/max).');
        } else {
          const min1 = s1 * 0.0075;
          const max1 = s1 * 0.01;
          const min2 = s2 * 0.005;
          const max2 = s2 * 0.0075;
          scaglioniRows.push(['Fascia 1', `Fino a 2.000.000 € | Quota: ${currency(s1)} | Aliquota: 0,75% - 1,00%`, `${currency(min1)} / ${currency(max1)}`]);
          scaglioniRows.push(['Fascia 2', `Oltre 2.000.000 € | Quota: ${currency(s2)} | Aliquota: 0,50% - 0,75%`, `${currency(min2)} / ${currency(max2)}`]);
        }
      }

      if (riquadro === 'r10_2') {
        const base = Number.isFinite(v1) ? v1 : 0;
        const minRate = 0.01;
        const maxRate = 0.05;
        const minVal = base * minRate;
        const maxVal = base * maxRate;
        scaglioniRows.push([
          'Range ministeriale',
          `Valore pratica: ${currency(base)} | Aliquota: 1% - 5%`,
          `${currency(minVal)} / ${currency(maxVal)}`,
        ]);
        scaglioniRows.push(['Media', 'Valore medio', currency((minVal + maxVal) / 2)]);
      }

      if (riquadro === 'r8_1') {
        const s1 = tierSpan(v1, 0, 2000000);
        const s2 = tierSpan(v1, 2000000, Infinity);

        if (Number.isFinite(a1) && Number.isFinite(a2)) {
          const p1 = s1 * a1;
          const p2 = s2 * a2;
          scaglioniRows.push(['Fascia 1', `Fino a 2.000.000 € | Quota: ${currency(s1)} | Aliquota: ${(a1 * 100).toFixed(2)}%`, currency(p1)]);
          scaglioniRows.push(['Fascia 2', `Oltre 2.000.000 € | Quota: ${currency(s2)} | Aliquota: ${(a2 * 100).toFixed(2)}%`, currency(p2)]);
        } else {
          const min1 = s1 * 0.0075;
          const max1 = s1 * 0.02;
          const min2 = s2 * 0.005;
          const max2 = s2 * 0.0075;
          scaglioniRows.push(['Fascia 1', `Fino a 2.000.000 € | Quota: ${currency(s1)} | Aliquota: 0,75% - 2,00%`, `${currency(min1)} / ${currency(max1)}`]);
          scaglioniRows.push(['Fascia 2', `Oltre 2.000.000 € | Quota: ${currency(s2)} | Aliquota: 0,50% - 0,75%`, `${currency(min2)} / ${currency(max2)}`]);
        }
      }

      if (riquadro === 'r10_3') {
        const base = Number.isFinite(v1) ? v1 : 0;
        const minRate = 0.01;
        const maxRate = 0.05;
        const minVal = base * minRate;
        const maxVal = base * maxRate;

        if (Number.isFinite(aCons)) {
          const custom = base * aCons;
          scaglioniRows.push([
            'Valore personalizzato',
            `Valore contestazione: ${currency(base)} | Aliquota selezionata: ${(aCons * 100).toFixed(2)}%`,
            currency(custom),
          ]);
          scaglioniRows.push([
            'Range ministeriale',
            'Min (1%) / Max (5%)',
            `${currency(minVal)} / ${currency(maxVal)}`,
          ]);
          mods.push('Aliquota personalizzata applicata (1% - 5%).');
        } else {
          scaglioniRows.push([
            'Range ministeriale',
            `Valore contestazione: ${currency(base)} | Aliquota: 1% - 5%`,
            `${currency(minVal)} / ${currency(maxVal)}`,
          ]);
        }
      }

      if (riquadro === 'r11') {
        const base = Number.isFinite(v2) ? (v1 + v2) : v1;
        inputRows.push(['Base', 'Sommatoria reddito + attività', Number.isFinite(base) ? currency(base) : '-']);

        const cap1 = 5000000;
        const cap2 = 100000000;
        const cap3 = 300000000;
        const cap4 = 800000000;

        const s1 = tierSpan(base, cap1, cap2);
        const s2 = tierSpan(base, cap2, cap3);
        const s3 = tierSpan(base, cap3, cap4);
        scaglioniRows.push(['Base fissa', 'Fino a 5.000.000 €', `${currency(6000)} / ${currency(8000)}`]);
        scaglioniRows.push(['Fascia 1', `Da 5M a 100M | Quota: ${currency(s1)} | Aliquota: 0,009% - 0,010%`, `${currency(s1 * 0.00009)} / ${currency(s1 * 0.00010)}`]);
        scaglioniRows.push(['Fascia 2', `Da 100M a 300M | Quota: ${currency(s2)} | Aliquota: 0,006% - 0,009%`, `${currency(s2 * 0.00006)} / ${currency(s2 * 0.00009)}`]);
        scaglioniRows.push(['Fascia 3', `Da 300M a 800M | Quota: ${currency(s3)} | Aliquota: 0,005% - 0,006%`, `${currency(s3 * 0.00005)} / ${currency(s3 * 0.00006)}`]);

        if (Number.isFinite(base) && base > cap4) {
          const over = base - cap4;
          const steps = Math.ceil(over / 100000000);
          scaglioniRows.push(['Oltre 800M', `Ogni 100M oltre 800M | Scatti: ${steps}`, `${currency(steps * 7500)} / ${currency(steps * 10000)}`]);
        }

        const ruolo = input && input.ruoloSindaco ? String(input.ruoloSindaco) : 'membro';
        if (ruolo === 'presidente') mods.push('Aumento: Presidente Collegio Sindacale (+50%).');
        if (ruolo === 'sindaco_unico') mods.push('Aumento: Sindaco Unico (+100%).');
        if (input && input.riduzioneComma2) mods.push('Riduzione: società di sola amministrazione/godimento o liquidazione (-50%).');
      }

      const pct = input && input.percentuale != null && !Number.isNaN(input.percentuale) ? Number(input.percentuale) : NaN;
      if (Number.isFinite(pct)) mods.push(`Percentuale (posizionamento nel range 0%=min, 100%=max): ${pct}%.`);

      if (!scaglioniRows.length) {
        scaglioniRows.push(['N/D', 'Scaglioni non disponibili per questo riquadro', '-']);
      }

      if (!mods.length) {
        mods.push('Nessun modificatore applicato.');
      }

      return { inputRows, scaglioniRows, mods };
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

    const riquadro = calculation && calculation.riquadro ? String(calculation.riquadro) : '';
    const docType = input && input.documentType ? String(input.documentType) : '';
    const normativa = normativeReferenceFor(riquadro, docType);
    const m = methodologyData({ riquadro, input, criterio: calculation && calculation.criterio ? calculation.criterio : '', result });

    sectionTitle('METODOLOGIA DI CALCOLO');
    fontRegular();
    doc.fontSize(10).fillColor('#111');
    doc.text('Il compenso è determinato applicando i parametri ministeriali al valore di riferimento indicato, calcolando un range (minimo e massimo) e individuando un valore all\'interno del range secondo il criterio (min/medio/max) o la percentuale (0%=min, 100%=max). Eventuali riduzioni o maggiorazioni previste dalla norma e il corrispettivo pattuito sono riportati a fini di trasparenza.', {
      align: 'left',
    });
    doc.moveDown(0.6);

    sectionTitle('DETTAGLIO DELLA METODOLOGIA DI CALCOLO');
    keyValueRow('Riferimento normativo', normativa);
    keyValueRow('Riquadro ministeriale', riquadro || '-');
    doc.moveDown(0.2);

    sectionTitle('RIEPILOGO DATI INSERITI');
    drawZebraTable({
      columns: ['Voce', 'Dettaglio', 'Valore'],
      rows: m.inputRows.length ? m.inputRows : [['N/D', 'Nessun dato disponibile', '-']],
    });

    sectionTitle('LOGICA STEP-BY-STEP (SCAGLIONI)');
    drawZebraTable({
      columns: ['Fascia', 'Dettaglio', 'Parziale'],
      rows: m.scaglioniRows,
    });

    sectionTitle('MODIFICATORI APPLICATI');
    fontRegular();
    doc.fontSize(10).fillColor('#111');
    m.mods.forEach((line) => {
      doc.text(line);
    });
    doc.moveDown(0.8);

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
      ['Percentuale', 'Posizionamento nel range (0%=min, 100%=max)', inputPct],
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
