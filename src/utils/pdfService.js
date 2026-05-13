const PDFDocument = require('pdfkit');
const { drawSingleLogoHeader } = require('./pdf/commonHeader');


// Native date formatter (dayjs not installed on backend)
const fmt = (date, includeTime = false) => {
  if (!date) return '—';
  const d = new Date(date);
  if (isNaN(d.getTime())) return '—';
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const day  = String(d.getDate()).padStart(2, '0');
  const mon  = months[d.getMonth()];
  const year = d.getFullYear();
  if (!includeTime) return `${day} ${mon} ${year}`;
  const hh = String(d.getHours() % 12 || 12).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const ap = d.getHours() >= 12 ? 'PM' : 'AM';
  return `${day} ${mon} ${year}, ${hh}:${mm} ${ap}`;
};

// ─── Color Palette ───────────────────────────────────────────
const COLORS = {
  primary:   '#1B3A5C',
  accent:    '#2563EB',
  success:   '#16A34A',
  danger:    '#DC2626',
  warning:   '#D97706',
  gray:      '#64748B',
  lightGray: '#F1F5F9',
  border:    '#E2E8F0',
  text:      '#0F172A',
};

function hexToRgb(hex) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? [parseInt(result[1], 16), parseInt(result[2], 16), parseInt(result[3], 16)]
    : [0, 0, 0];
}

function applyColor(doc, hex) {
  doc.fillColor(hexToRgb(hex));
}

function drawLine(doc, y, color = COLORS.border) {
  const yPos = y !== undefined ? y : doc.y;
  doc.moveTo(50, yPos).lineTo(545, yPos).strokeColor(hexToRgb(color)).lineWidth(0.5).stroke();
}

function drawTableRow(doc, cols, widths, y, isHeader = false) {
  const totalWidth = widths.reduce((a, b) => a + b, 0);
  let x = 50;
  cols.forEach((col, i) => {
    const w = widths[i] || Math.floor(totalWidth / cols.length);
    if (isHeader) {
      doc.rect(x, y - 3, w, 18).fill(hexToRgb(COLORS.primary));
      applyColor(doc, '#FFFFFF');
      doc.fontSize(8).font('Roboto-Bold').text(col, x + 3, y + 1, { width: w - 6, ellipsis: true });
    } else {
      applyColor(doc, COLORS.text);
      doc.fontSize(8).font('Roboto').text(col, x + 3, y + 1, { width: w - 6, ellipsis: true });
    }
    x += w;
  });
  return y + 20;
}

// ═══════════════════════════════════════════════════════════
//  INVOICE PDF — Full data, inline, professional
// ═══════════════════════════════════════════════════════════
/**
 * Generate a professional invoice PDF with full data.
 * @param {Object} invoice  - populated FeeInvoice mongoose doc or plain object
 * @param {Object} school   - SchoolSetting document
 * @param {Object} [penaltySummary] - auto-calculated penalty { totalPenalty, daysOverdue, breakdown }
 * @returns {PDFDocument}
 */
async function generateInvoicePDF(invoice, school, penaltySummary = null) {
  const doc = new PDFDocument({ margin: 50, size: 'A4', bufferPages: true });

  const path = require('path');
  doc.registerFont('Roboto', path.join(__dirname, 'Roboto-Regular.ttf'));
  doc.registerFont('Roboto-Bold', path.join(__dirname, 'Roboto-Bold.ttf'));
  
  const schoolName  = school?.schoolName || school?.name || 'VMS School ERP';
  const schoolAddr  = school?.contact?.address || school?.address || '';
  const schoolPhone = school?.contact?.phone   || school?.phone   || '';
  const schoolEmail = school?.contact?.email   || school?.email   || '';
  const logoUrl     = school?.logoUrl || null;

  const student = invoice.studentId || {};
  const cls     = invoice.classId   || {};
  const section = invoice.sectionId || {};
  const ay      = invoice.academicYearId || {};
  const profile = invoice.feeProfileId  || {};

  const livePenalty = penaltySummary?.totalPenalty || 0;
  const storedPenalty = invoice.penaltyAmount || 0;
  const effectivePenalty = Math.max(livePenalty, storedPenalty);

  // Use netFee (new schema) or fall back to totalAmount (legacy)
  const grossFee   = invoice.grossFee || invoice.totalAmount || 0;
  const netFee     = invoice.netFee || Math.max(0, grossFee - (invoice.discountAmount || 0));
  const netTotal   = netFee + effectivePenalty - (invoice.waivedAmount || 0);
  const balanceDue = invoice.dueAmount || Math.max(0, netTotal - (invoice.paidAmount || 0));

  // ─── Dual-Logo Header ────────────────────────────────────
  let headerEndY = 95;
  try {
    headerEndY = await drawSingleLogoHeader(doc, school, { startY: 20 });
  } catch { headerEndY = 95; }

  // Right of header: FEE INVOICE label + invoice number
  applyColor(doc, '#93C5FD');
  doc.fontSize(11).font('Roboto-Bold').text('FEE INVOICE', 370, 28, { width: 175, align: 'right' });
  applyColor(doc, '#FFFFFF');
  doc.fontSize(8).font('Roboto').text(invoice.invoiceNumber || '—', 370, 42, { width: 175, align: 'right' });
  doc.fontSize(7).text(`Generated: ${fmt(new Date(), true)}`, 370, 52, { width: 175, align: 'right' });
  doc.fontSize(7).text(`AY: ${ay.name || ay.label || '—'}`, 370, 62, { width: 175, align: 'right' });

  doc.y = headerEndY;

  // ─── Status Badge ─────────────────────────────────────────
  const statusColor = invoice.status === 'paid'
    ? COLORS.success : invoice.status === 'partial'
    ? COLORS.warning : COLORS.danger;
  doc.rect(430, 90, 115, 22).fill(hexToRgb(statusColor));
  applyColor(doc, '#FFFFFF');
  doc.fontSize(9).font('Roboto-Bold')
     .text((invoice.status || 'UNPAID').toUpperCase(), 432, 96, { width: 111, align: 'center' });

  // ─── Student Info Box ─────────────────────────────────────
  applyColor(doc, COLORS.primary);
  doc.fontSize(11).font('Roboto-Bold').text('Student Details', 50, 103);
  drawLine(doc, 118);
  doc.y = 122;

  const sectionName = section?.name || student?.sectionId?.name || '—';
  const className   = cls?.name || student?.classId?.name || '—';
  const parentPhone = student?.parentPhone || invoice?.parentPhone || '—';
  const parentEmail = student?.parentEmail || invoice?.parentEmail || '';

  const infoRows = [
    ['Student Name', student.name || '—',          'Class / Section',  `${className}${sectionName !== '—' ? ' / ' + sectionName : ''}`],
    ['Roll No',      student.rollNo || student.admissionNumber || '—', 'Academic Year', ay.name || ay.label || '—'],
    ['Parent Name',  student.parentName || '—',     'Parent Phone',     parentPhone],
    ['Invoice No',   invoice.invoiceNumber || '—',  'Parent Email',     parentEmail || '—'],
    ['Next Due Date', invoice.nextDueDate ? fmt(invoice.nextDueDate) : '—', 'Invoice Date', fmt(invoice.createdAt || new Date())],
  ];

  infoRows.forEach(([l1, v1, l2, v2]) => {
    const y = doc.y;
    applyColor(doc, COLORS.gray);
    doc.fontSize(8).font('Roboto').text(l1 + ':', 50, y);
    applyColor(doc, COLORS.text);
    doc.fontSize(9).font('Roboto-Bold').text(v1, 145, y, { width: 165 });

    applyColor(doc, COLORS.gray);
    doc.fontSize(8).font('Roboto').text(l2 + ':', 325, y);
    applyColor(doc, COLORS.text);
    doc.fontSize(9).font('Roboto-Bold').text(v2, 420, y, { width: 125 });

    doc.y = y + 16;
  });

  doc.moveDown(0.4);
  drawLine(doc);
  doc.moveDown(0.5);

  // ─── Fee Component Breakdown ───────────────────────────────
  applyColor(doc, COLORS.primary);
  doc.fontSize(11).font('Roboto-Bold').text('Fee Breakdown');
  doc.moveDown(0.3);

  const COMP_WIDTHS = [30, 180, 90, 100, 95];
  let tableY = doc.y;
  tableY = drawTableRow(doc, ['#', 'Fee Component', 'Type', 'Amount (₹)', 'Mandatory'], COMP_WIDTHS, tableY, true);

  // Use selectedComponents from feeProfileId (populated) or directly from profile param
  const components = (profile?.selectedComponents || invoice.feeProfileId?.selectedComponents || []);

  if (components.length > 0) {
    components.forEach((comp, i) => {
      const compData = comp.componentId || comp;
      const bg = i % 2 === 0 ? '#FFFFFF' : '#F8FAFC';
      doc.rect(50, tableY - 3, 495, 18).fill(hexToRgb(bg));
      applyColor(doc, COLORS.text);
      tableY = drawTableRow(doc, [
        String(i + 1),
        comp.name   || compData.name || `Fee ${i + 1}`,
        comp.recurringType || compData.recurringType || 'yearly',
        `₹${(comp.amount || compData.amount || 0).toLocaleString('en-IN')}`,
        (comp.mandatory || compData.mandatory) ? 'Yes' : 'No',
      ], COMP_WIDTHS, tableY);
    });
  } else {
    doc.rect(50, tableY - 3, 495, 18).fill(hexToRgb('#F8FAFC'));
    applyColor(doc, COLORS.text);
    tableY = drawTableRow(doc,
      ['1', 'Annual Fee', 'yearly', `₹${grossFee.toLocaleString('en-IN')}`, '—'],
      COMP_WIDTHS, tableY
    );
  }

  drawLine(doc, tableY);
  doc.y = tableY + 6;

  // ─── Summary Totals ─────────────────────────────────────────
  doc.moveDown(0.3);
  const discount = invoice.discountAmount || 0;
  const waived   = invoice.waivedAmount   || 0;

  const summaryRows = [
    ['Gross Fee Total',   grossFee,                          COLORS.text,    false],
    ['Discount Applied', -(discount),                        COLORS.success, true],
    ['Waiver Applied',   -(waived),                          COLORS.success, true],
    ['Net Fee',          netFee,                             COLORS.text,    false],
    ['Late Fee / Penalty', effectivePenalty,                 COLORS.danger,  true],
    ['Amount Paid',      -(invoice.paidAmount || 0),         COLORS.success, true],
    ['Balance Due',      balanceDue,                         balanceDue > 0 ? COLORS.danger : COLORS.success, false],
  ];

  summaryRows.forEach(([label, value, color, indent]) => {
    if (value === 0 && label !== 'Balance Due' && label !== 'Gross Fee Total') return;
    const y = doc.y;
    const displayVal = Math.abs(value);
    const prefix     = value < 0 ? '- ' : '';
    const lx         = indent ? 320 : 300;
    applyColor(doc, COLORS.gray);
    doc.fontSize(9).font('Roboto').text(label, lx, y, { width: 140 });
    applyColor(doc, color);
    doc.fontSize(label === 'Balance Due' ? 11 : 9)
       .font(label === 'Balance Due' ? 'Roboto-Bold' : 'Roboto')
       .text(`${prefix}₹${displayVal.toLocaleString('en-IN')}`, 460, y, { width: 85, align: 'right' });
    doc.y = y + (label === 'Balance Due' ? 16 : 14);
  });

  // Auto-penalty info
  if (penaltySummary?.daysOverdue > 0) {
    const y = doc.y + 2;
    applyColor(doc, COLORS.danger);
    doc.fontSize(8).font('Roboto')
       .text(`⚡ Auto-calculated: ${penaltySummary.breakdown || `${penaltySummary.daysOverdue} days overdue`}`, 50, y);
    doc.y = y + 12;
  }

  doc.moveDown(0.4);
  drawLine(doc);

  // ─── Installment Detail ────────────────────────────────────
  const installments = invoice.installments || [];
  if (installments.length > 0) {
    doc.moveDown(0.6);
    applyColor(doc, COLORS.primary);
    doc.fontSize(11).font('Roboto-Bold').text('Installment Schedule');
    doc.moveDown(0.3);

    const INST_WIDTHS = [25, 110, 85, 75, 75, 75, 50];
    let iy = doc.y;
    iy = drawTableRow(doc, ['#', 'Label', 'Due Date', 'Amount', 'Paid', 'Balance', 'Status'], INST_WIDTHS, iy, true);

    installments.forEach((inst, i) => {
      const bg = i % 2 === 0 ? '#FFFFFF' : '#F8FAFC';
      doc.rect(50, iy - 3, 495, 18).fill(hexToRgb(bg));
      applyColor(doc, COLORS.text);
      const overdueFlag = inst.dueDate && new Date(inst.dueDate) < new Date() && inst.status !== 'paid' ? ' ⚠' : '';
      iy = drawTableRow(doc, [
        String(inst.installmentNo || i + 1),
        inst.label || `Installment ${i + 1}`,
        inst.dueDate ? fmt(inst.dueDate) + overdueFlag : '—',
        `₹${(inst.amount || 0).toLocaleString('en-IN')}`,
        `₹${(inst.paidAmount || 0).toLocaleString('en-IN')}`,
        `₹${(inst.balanceAmount != null ? inst.balanceAmount : Math.max(0, (inst.amount || 0) - (inst.paidAmount || 0))).toLocaleString('en-IN')}`,
        (inst.status || 'pending').toUpperCase(),
      ], INST_WIDTHS, iy);
    });

    drawLine(doc, iy);
    doc.y = iy + 5;
  }

  // ─── Discounts Detail ─────────────────────────────────────
  const discounts = profile?.discounts || invoice.feeProfileId?.discounts || [];
  if (discounts.length > 0) {
    doc.moveDown(0.6);
    applyColor(doc, COLORS.primary);
    doc.fontSize(10).font('Roboto-Bold').text('Discounts Applied');
    doc.moveDown(0.2);

    discounts.forEach((d, i) => {
      const y = doc.y;
      applyColor(doc, COLORS.gray);
      doc.fontSize(8).font('Roboto').text(`${i + 1}. ${d.label || d.type}`, 50, y, { width: 200 });
      applyColor(doc, COLORS.success);
      doc.fontSize(8).font('Roboto-Bold').text(
        d.discountType === 'percent' ? `-${d.value}%` : `-₹${d.value.toLocaleString('en-IN')}`,
        260, y, { width: 120, align: 'right' }
      );
      doc.y = y + 13;
    });
  }

  // ─── Footer ───────────────────────────────────────────────
  doc.moveDown(1.5);
  drawLine(doc);
  doc.moveDown(0.4);
  applyColor(doc, COLORS.gray);
  doc.fontSize(8).font('Roboto')
     .text('This is a computer-generated invoice. No physical signature required.', { align: 'center' });
  doc.fontSize(7).font('Roboto').text(`Generated on ${fmt(new Date(), true)} · ${schoolName}`, { align: 'center' });

  if (invoice.locked) {
    doc.moveDown(0.3);
    applyColor(doc, COLORS.danger);
    doc.fontSize(8).font('Roboto-Bold').text('⚠ LOCKED — This invoice cannot be modified.', { align: 'center' });
  }

  return doc;
}

// ═══════════════════════════════════════════════════════════
//  RECEIPT PDF
// ═══════════════════════════════════════════════════════════
/**
 * Generate a professional payment receipt PDF.
 */
async function generateReceiptPDF(payment, invoice, school) {
  const doc = new PDFDocument({ margin: 40, size: 'A5' });

  const path = require('path');
  doc.registerFont('Roboto', path.join(__dirname, 'Roboto-Regular.ttf'));
  doc.registerFont('Roboto-Bold', path.join(__dirname, 'Roboto-Bold.ttf'));

  const schoolName = school?.schoolName || school?.name || 'VMS School ERP';
  const student    = payment.studentId || {};
  const cls        = invoice?.classId  || student.classId || {};

  // ─── Dual-Logo Header (compact for A5) ─────────────────────
  let headerEndY = 80;
  try {
    headerEndY = await drawSingleLogoHeader(doc, school, { startY: 10, logoSize: 42 });
  } catch { headerEndY = 80; }

  // PAID stamp circle (top right overlay on header)
  doc.circle(375, 40, 26).fill(hexToRgb('#2563EB'));
  applyColor(doc, '#FFFFFF');
  doc.fontSize(8).font('Roboto-Bold').text('PAID', 350, 35, { width: 52, align: 'center' });
  doc.fontSize(7).font('Roboto').text('RECEIPT', 350, 45, { width: 52, align: 'center' });

  doc.y = headerEndY;

  // ─── Student Info ─────────────────────────────────────────
  const infoRows = [
    ['Student',       student.name || '—'],
    ['Class',         cls.name || '—'],
    ['Roll No',       student.rollNo || student.admissionNumber || '—'],
    ['Date',          fmt(payment.paidAt || payment.createdAt, true)],
    ['Payment Mode',  (payment.paymentMode || '—').toUpperCase()],
  ];

  if (payment.transactionId) infoRows.push(['Transaction ID', payment.transactionId]);
  if (payment.collectedBy?.name) infoRows.push(['Collected By', payment.collectedBy.name]);
  if (invoice?.invoiceNumber) infoRows.push(['Invoice No', invoice.invoiceNumber]);

  infoRows.forEach(([label, value]) => {
    const y = doc.y;
    applyColor(doc, COLORS.gray);
    doc.fontSize(8).font('Roboto').text(label + ':', 30, y, { width: 110 });
    applyColor(doc, COLORS.text);
    doc.fontSize(8).font('Roboto-Bold').text(value, 145, y, { width: 245 });
    doc.y = y + 14;
  });

  doc.moveDown(0.5);
  drawLine(doc);
  doc.moveDown(0.5);

  // ─── Amount Highlight ─────────────────────────────────────
  const amtBoxY = doc.y;
  doc.rect(30, amtBoxY, 360, 40).fill(hexToRgb(COLORS.accent));
  applyColor(doc, '#FFFFFF');
  doc.fontSize(10).font('Roboto').text('Amount Paid', 40, amtBoxY + 6, { width: 160 });
  doc.fontSize(17).font('Roboto-Bold').text(
    `₹${(payment.amount || 0).toLocaleString('en-IN')}`,
    40, amtBoxY + 8, { width: 340, align: 'right' }
  );
  doc.y = amtBoxY + 48;

  // Remaining due
  if (invoice) {
    const due = invoice.dueAmount || 0;
    const dueColor = due > 0 ? COLORS.danger : COLORS.success;
    const y = doc.y;
    applyColor(doc, COLORS.gray);
    doc.fontSize(9).font('Roboto').text('Balance Due After Payment:', 30, y, { width: 220 });
    applyColor(doc, dueColor);
    doc.fontSize(10).font('Roboto-Bold').text(`₹${due.toLocaleString('en-IN')}`, 250, y, { width: 140, align: 'right' });
    doc.y = y + 16;
  }

  doc.moveDown(1);
  drawLine(doc);
  doc.moveDown(0.4);
  applyColor(doc, COLORS.gray);
  doc.fontSize(7).font('Roboto')
     .text('This is a computer-generated receipt. No physical signature required.', { align: 'center' });
  doc.fontSize(7).text(`Generated: ${fmt(new Date(), true)}`, { align: 'center' });

  return doc;
}

module.exports = { generateInvoicePDF, generateReceiptPDF };
