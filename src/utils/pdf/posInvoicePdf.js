'use strict';

const path = require('path');
const PDFDocument = require('pdfkit');
const { drawSingleLogoHeader } = require('./commonHeader');

// Roboto fonts â€” same as existing pdfService.js
const FONT_REGULAR = path.join(__dirname, '..', 'Roboto-Regular.ttf');
const FONT_BOLD    = path.join(__dirname, '..', 'Roboto-Bold.ttf');

const COLORS = {
  primary:   [194, 65, 12],
  accent:    [194, 65, 12],
  text:      [15, 23, 42],
  gray:      [100, 116, 139],
  lightGray: [241, 245, 249],
  border:    [226, 232, 240],
  white:     [255, 255, 255],
  success:   [22, 163, 74],
};

function fmt(date) {
  if (!date) return 'â€”';
  const d = new Date(date);
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const day  = String(d.getDate()).padStart(2, '0');
  const mon  = months[d.getMonth()];
  const year = d.getFullYear();
  const hh   = String(d.getHours() % 12 || 12).padStart(2, '0');
  const mm   = String(d.getMinutes()).padStart(2, '0');
  const ap   = d.getHours() >= 12 ? 'PM' : 'AM';
  return `${day} ${mon} ${year}, ${hh}:${mm} ${ap}`;
}

function inr(num) {
  return `Rs.${(Number(num) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
}

/**
 * Generate a POS invoice PDF buffer.
 *
 * @param {Object} invoice  - Populated PosInvoice document (lean)
 * @param {Object} school   - SchoolSetting document (lean)
 * @returns {Promise<Buffer>}
 */

async function generatePosInvoicePdf(invoice, school) {
  return new Promise(async (resolve, reject) => {
    const chunks = [];
    const doc = new PDFDocument({ size: 'A4', margin: 50, bufferPages: true });

    doc.registerFont('Roboto', FONT_REGULAR);
    doc.registerFont('Roboto-Bold', FONT_BOLD);

    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const pageWidth = doc.page.width - 100; // margins

    // â”€â”€ Dual-logo header (shared helper) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    let yAfterHeader;
    try {
      yAfterHeader = await drawSingleLogoHeader(doc, school, { startY: 20 });
    } catch {
      yAfterHeader = 115;
    }

    // "INVOICE" label â€” right aligned inside header band area
    doc.fillColor([253, 224, 71]).font('Roboto-Bold').fontSize(14)
       .text('INVOICE', 400, 55, { width: 140, align: 'right' });
    doc.fillColor([203, 213, 225]).font('Roboto').fontSize(8)
       .text(invoice.invoiceNumber || 'â€”', 400, 72, { width: 140, align: 'right' });

    doc.y = yAfterHeader + 10;

    // â”€â”€ Invoice Meta â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    const metaY = doc.y;
    doc.fillColor(COLORS.text).font('Roboto-Bold').fontSize(9)
       .text('Invoice #:', 50, metaY)
       .text('Date:', 50, metaY + 14)
       .text('Payment Mode:', 50, metaY + 28);

    doc.font('Roboto').fontSize(9)
       .text(invoice.invoiceNumber || 'â€”', 135, metaY)
       .text(fmt(invoice.createdAt), 135, metaY + 14)
       .text((invoice.paymentMode || '').toUpperCase(), 135, metaY + 28);

    // Student info (right column)
    if (invoice.studentSnapshot?.name) {
      doc.font('Roboto-Bold').fontSize(9)
         .text('Student:', 350, metaY)
         .text('Roll No:', 350, metaY + 14)
         .text('Class:', 350, metaY + 28);
      doc.font('Roboto').fontSize(9)
         .text(invoice.studentSnapshot.name, 410, metaY, { width: 130 })
         .text(invoice.studentSnapshot.rollNo || 'â€”', 410, metaY + 14)
         .text(invoice.studentSnapshot.className || 'â€”', 410, metaY + 28);
    }

    doc.moveDown(3);

    // â”€â”€ Line items table â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    const tableY = doc.y;
    const cols = [30, 200, 50, 70, 60, 50, 80];
    const headers = ['#', 'Item', 'Qty', 'Unit (Rs.)', 'Disc (Rs.)', 'Tax%', 'Amount (Rs.)'];

    // Header row
    doc.rect(50, tableY, pageWidth, 18).fill(COLORS.primary);
    let cx = 50;
    headers.forEach((h, i) => {
      doc.fillColor(COLORS.white).font('Roboto-Bold').fontSize(7.5)
         .text(h, cx + 3, tableY + 4, { width: cols[i] - 6, align: i > 1 ? 'right' : 'left' });
      cx += cols[i];
    });

    let rowY = tableY + 20;
    (invoice.items || []).forEach((item, idx) => {
      const bg = idx % 2 === 0 ? COLORS.lightGray : COLORS.white;
      doc.rect(50, rowY, pageWidth, 16).fill(bg);
      cx = 50;
      const cells = [
        String(idx + 1),
        item.nameSnapshot,
        String(item.qty),
        inr(item.unitPrice),
        inr(item.discount || 0),
        `${item.taxPercent || 0}%`,
        inr(item.lineTotal),
      ];
      cells.forEach((cell, i) => {
        doc.fillColor(COLORS.text).font('Roboto').fontSize(7.5)
           .text(cell, cx + 3, rowY + 3, { width: cols[i] - 6, align: i > 1 ? 'right' : 'left', ellipsis: true });
        cx += cols[i];
      });
      rowY += 16;
    });

    // Border
    doc.rect(50, tableY, pageWidth, rowY - tableY).strokeColor(COLORS.border).lineWidth(0.5).stroke();

    rowY += 8;

    // â”€â”€ Totals block â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    const totalsX = 380;
    const totals = [
      ['Subtotal',     inr(invoice.subtotal)],
      ['Discount',     `- ${inr(invoice.discountTotal || 0)}`],
      ['Tax',          inr(invoice.taxTotal || 0)],
    ];
    totals.forEach(([label, val]) => {
      doc.fillColor(COLORS.gray).font('Roboto').fontSize(8.5)
         .text(label, totalsX, rowY, { width: 90 })
         .text(val, totalsX + 90, rowY, { width: 80, align: 'right' });
      rowY += 14;
    });

    // Grand total row
    doc.rect(totalsX - 4, rowY, 174, 20).fill(COLORS.primary);
    doc.fillColor(COLORS.white).font('Roboto-Bold').fontSize(10)
       .text('Grand Total', totalsX, rowY + 4, { width: 90 })
       .text(inr(invoice.grandTotal), totalsX + 90, rowY + 4, { width: 80, align: 'right' });
    rowY += 28;

    // Payment ref
    if (invoice.paymentRef) {
      doc.fillColor(COLORS.gray).font('Roboto').fontSize(8)
         .text(`Payment Ref: ${invoice.paymentRef}`, 50, rowY);
      rowY += 14;
    }
    if (invoice.notes) {
      doc.text(`Notes: ${invoice.notes}`, 50, rowY);
      rowY += 14;
    }

    // â”€â”€ Footer / Signature â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    const footerY = doc.page.height - 100;
    doc.moveTo(50, footerY).lineTo(545, footerY).strokeColor(COLORS.border).lineWidth(0.5).stroke();
    doc.fillColor(COLORS.gray).font('Roboto').fontSize(7.5)
       .text('This is a computer-generated invoice.', 50, footerY + 6);

    // Principal signature block
    doc.font('Roboto-Bold').fontSize(8)
       .text('Authorised Signatory', 400, footerY + 6, { width: 140, align: 'right' });
    doc.font('Roboto').fontSize(8)
       .text(school?.principal?.name || school?.principalName || 'Principal', 400, footerY + 18, { width: 140, align: 'right' });
    doc.text(school?.schoolName || '', 400, footerY + 30, { width: 140, align: 'right' });

    doc.end();
  });
}

module.exports = { generatePosInvoicePdf };
