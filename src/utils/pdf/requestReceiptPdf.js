'use strict';

const path = require('path');
const PDFDocument = require('pdfkit');

const FONT_REGULAR = path.join(__dirname, '..', 'Roboto-Regular.ttf');
const FONT_BOLD    = path.join(__dirname, '..', 'Roboto-Bold.ttf');

const COLORS = {
  primary:   [27, 58, 92],
  text:      [15, 23, 42],
  gray:      [100, 116, 139],
  white:     [255, 255, 255],
  border:    [226, 232, 240],
  lightGray: [241, 245, 249],
};

function fmt(date) {
  if (!date) return '—';
  const d = new Date(date);
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${String(d.getDate()).padStart(2, '0')} ${months[d.getMonth()]} ${d.getFullYear()}`;
}

function inr(num) {
  return `Rs.${(Number(num) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
}

/**
 * Generate a vault document request receipt PDF.
 *
 * @param {Object} request - StudentDocumentRequest (populated: catalogItemId, studentId)
 * @param {Object} school  - SchoolSetting (lean)
 * @returns {Promise<Buffer>}
 */
async function generateRequestReceiptPdf(request, school) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    const doc = new PDFDocument({ size: 'A5', margin: 40, bufferPages: true });

    doc.registerFont('Roboto', FONT_REGULAR);
    doc.registerFont('Roboto-Bold', FONT_BOLD);

    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const pageWidth = doc.page.width - 80;

    // ── Header ───────────────────────────────────────────────
    doc.rect(40, 30, pageWidth, 55).fill(COLORS.primary);
    doc.fillColor(COLORS.white).font('Roboto-Bold').fontSize(13)
       .text(school?.schoolName || 'VMS School', 50, 38, { width: pageWidth });
    doc.font('Roboto').fontSize(8)
       .text('PAYMENT RECEIPT — DOCUMENT REQUEST', 50, 56, { width: pageWidth });

    doc.moveDown(3.5);

    // ── Receipt Body ─────────────────────────────────────────
    const bodyY = doc.y + 5;
    const rows = [
      ['Receipt #',     request.requestNumber || request._id?.toString()?.slice(-8)?.toUpperCase()],
      ['Student',       request.studentId?.name || '—'],
      ['Document',      request.catalogItemId?.name || '—'],
      ['Copies',        String(request.copies || 1)],
      ['Amount',        inr(request.amount || 0)],
      ['Discount',      inr(request.discount || 0)],
      ['Net Amount',    inr(request.netAmount || 0)],
      ['Payment Mode',  (request.paymentMode || '—').toUpperCase()],
      ['Payment Status',request.paymentStatus?.toUpperCase() || '—'],
      ['Request Status',request.requestStatus?.toUpperCase() || '—'],
      ['Date',          fmt(request.createdAt)],
    ];

    rows.forEach(([label, value], i) => {
      const rowY = bodyY + i * 18;
      const bg = i % 2 === 0 ? COLORS.lightGray : COLORS.white;
      doc.rect(40, rowY, pageWidth, 17).fill(bg);
      doc.fillColor(COLORS.gray).font('Roboto-Bold').fontSize(8)
         .text(label, 45, rowY + 4, { width: 100 });
      doc.fillColor(COLORS.text).font('Roboto').fontSize(8)
         .text(value, 150, rowY + 4, { width: pageWidth - 110 });
    });

    const endY = bodyY + rows.length * 18 + 10;

    // ── Footer ───────────────────────────────────────────────
    doc.moveTo(40, endY).lineTo(40 + pageWidth, endY).strokeColor(COLORS.border).lineWidth(0.5).stroke();
    doc.fillColor(COLORS.gray).font('Roboto').fontSize(7)
       .text('This is a computer-generated receipt.', 40, endY + 6, { width: pageWidth, align: 'center' });

    doc.end();
  });
}

module.exports = { generateRequestReceiptPdf };
