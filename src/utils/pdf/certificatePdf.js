'use strict';
/**
 * Certificate PDF Generator
 * Renders an HTML-based certificate template with student variables replaced,
 * then streams it as a pdfkit document.
 */

const PDFDocument = require('pdfkit');
const path = require('path');
const { drawSingleLogoHeader } = require('./commonHeader');

const FONT_REGULAR = path.join(__dirname, '..', 'Roboto-Regular.ttf');
const FONT_BOLD    = path.join(__dirname, '..', 'Roboto-Bold.ttf');

const PRIMARY_RGB = [194, 65, 12];
const WHITE_RGB   = [255, 255, 255];

// ── Date formatter ──────────────────────────────────────────────────────
const fmtDate = (date) => {
  if (!date) return '—';
  const d = new Date(date);
  if (isNaN(d.getTime())) return '—';
  const months = ['January','February','March','April','May','June',
                  'July','August','September','October','November','December'];
  return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
};

// ── Build variables map from student + school data ──────────────────────
function buildVariables(student, school, academicYear) {
  const cls     = student.classId     || {};
  const section = student.sectionId   || {};
  const ay      = academicYear        || {};

  const today = new Date();
  const months = ['January','February','March','April','May','June',
                  'July','August','September','October','November','December'];
  const todayStr = `${today.getDate()} ${months[today.getMonth()]} ${today.getFullYear()}`;

  const fullName = student.name || '—';
  const nameParts = fullName.trim().split(' ');
  const firstName = nameParts[0] || '—';
  const lastName  = nameParts.slice(1).join(' ') || '—';

  return {
    studentName:          fullName,
    firstName,
    lastName,
    admissionNo:          student.admissionNo || student.admissionNumber || '—',
    rollNo:               student.rollNo || '—',
    registerNo:           student.registerNo || '—',
    className:            cls.name || '—',
    sectionName:          section.name || '—',
    dateOfBirth:          student.dateOfBirth ? fmtDate(student.dateOfBirth) : '—',
    fatherName:           student.fatherName || '—',
    motherName:           student.motherName || '—',
    parentName:           student.parentName || student.fatherName || '—',
    address:              student.address || '—',
    phone:                student.parentPhone || student.phone || '—',
    gender:               student.gender ? (student.gender.charAt(0).toUpperCase() + student.gender.slice(1)) : '—',
    nationality:          student.nationality || 'Indian',
    religion:             student.religion || '—',
    bloodGroup:           student.bloodGroup || '—',
    caste:                student.caste || '—',
    academicYear:         ay.name || ay.label || '—',
    date:                 todayStr,
    schoolName:           school?.schoolName || school?.name || '—',
    schoolAddress:        school?.contact?.address || school?.address || '—',
    schoolPhone:          school?.contact?.phone   || school?.phone   || '—',
    schoolEmail:          school?.contact?.email   || school?.email   || '—',
    principalName:        '—',   // overridden below
    principalDesignation: 'Principal',
  };
}

// ── Replace {{variable}} tokens in text ─────────────────────────────────
function resolveVars(text, vars) {
  if (!text) return '';
  return text.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? '—');
}

// ── Strip HTML tags for PDFKit plain text rendering ────────────────────
function stripHtml(html) {
  if (!html) return '';
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

// ── Safe image helper ───────────────────────────────────────────────────
function safePlaceImage(doc, buf, x, y, opts) {
  if (!buf) return;
  try { doc.image(buf, x, y, opts); } catch { /* skip corrupt images */ }
}

// ── Fetch remote image ──────────────────────────────────────────────────
async function fetchImageBuffer(url) {
  if (!url) return null;
  try {
    const axios = require('axios');
    const https = require('https');
    const agent = new https.Agent({ rejectUnauthorized: false });
    
    // Resolve relative local URLs
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      const fs = require('fs');
      const filePath = path.join(__dirname, '..', '..', '..', 'public', url.replace(/^\//, ''));
      if (fs.existsSync(filePath)) {
        return fs.readFileSync(filePath);
      }
      return null;
    }
    
    const resp = await axios.get(url, {
      responseType: 'arraybuffer',
      timeout: 8000,
      httpsAgent: agent
    });
    return Buffer.from(resp.data);
  } catch (err) {
    console.error(`[fetchImageBuffer] Error loading ${url}:`, err.message);
    return null;
  }
}

// ════════════════════════════════════════════════════════════════════════
//  MAIN EXPORT
// ════════════════════════════════════════════════════════════════════════
/**
 * Generate a certificate PDF document.
 *
 * @param {Object} template   - CertificateTemplate document
 * @param {Object} student    - Student document (populated classId, sectionId)
 * @param {Object} school     - SchoolSetting document
 * @param {Object} [academicYear] - AcademicYear document (optional)
 * @returns {Promise<PDFDocument>}
 */
async function generateCertificatePDF(template, student, school, academicYear) {
  const doc = new PDFDocument({
    margin: 40,
    size: 'A4',
    bufferPages: true,
    info: {
      Title: template.name || 'Certificate',
      Author: school?.schoolName || 'School',
    },
  });

  // Fonts
  try { doc.registerFont('Roboto',      FONT_REGULAR); } catch {}
  try { doc.registerFont('Roboto-Bold', FONT_BOLD);    } catch {}

  // Determine standard font mappings
  const family = template.fontFamily || 'Times New Roman';
  const isBold = !!template.bold;
  const isItalic = !!template.italic;

  let docFont = 'Times-Roman';
  if (family === 'Roboto') {
    docFont = isBold ? 'Roboto-Bold' : 'Roboto';
  } else if (family === 'Arial' || family === 'Helvetica') {
    if (isBold && isItalic) docFont = 'Helvetica-BoldOblique';
    else if (isBold) docFont = 'Helvetica-Bold';
    else if (isItalic) docFont = 'Helvetica-Oblique';
    else docFont = 'Helvetica';
  } else {
    // Times New Roman or Georgia or default
    if (isBold && isItalic) docFont = 'Times-BoldItalic';
    else if (isBold) docFont = 'Times-Bold';
    else if (isItalic) docFont = 'Times-Italic';
    else docFont = 'Times-Roman';
  }

  // Draw elegant double border around the A4 certificate page
  const primaryColor = template.textColor || '#c2410c'; // custom or brand orange
  // Outer border
  doc.rect(20, 20, 555, 802)
     .lineWidth(2)
     .strokeColor(primaryColor)
     .stroke();
  // Inner thin border
  doc.rect(24, 24, 547, 794)
     .lineWidth(0.8)
     .strokeColor(primaryColor)
     .stroke();

  // ── Build variable map ────────────────────────────────────────────────
  const vars = buildVariables(student, school, academicYear);
  if (template.principalName)        vars.principalName        = template.principalName;
  if (template.principalDesignation) vars.principalDesignation = template.principalDesignation;

  // ── Draw letterhead / custom letterhead ────────────────────────────────
  let contentStartY = 45;

  if (template.letterheadUrl) {
    // Use custom letterhead image
    const lhBuf = await fetchImageBuffer(template.letterheadUrl);
    if (lhBuf) {
      safePlaceImage(doc, lhBuf, 35, 30, { width: 525, height: 100 });
      contentStartY = 140;
    }
  } else if (template.useSchoolLetterhead !== false) {
    const logoToUse = template.logoUrl || template.customLogoUrl || school?.logoUrl;
    const logoBuf = logoToUse ? await fetchImageBuffer(logoToUse) : null;
    
    if (logoBuf) {
      safePlaceImage(doc, logoBuf, 272, 32, { width: 50, height: 50 });
      doc.y = 88;
    } else {
      doc.y = 35;
    }

    doc.fillColor(primaryColor)
       .font('Times-Bold')
       .fontSize(16)
       .text('V.S.S. ENGLISH MEDIUM SCHOOL MUDDUR', 40, doc.y, { align: 'center', width: 515 });
    
    doc.fillColor([15, 23, 42])
       .font('Times-Bold')
       .fontSize(10)
       .text('(Affiliated to CBSE- No :831481)', { align: 'center', width: 515 });
       
    doc.fillColor([100, 116, 139])
       .font('Times-Roman')
       .fontSize(9)
       .text('Muddur, Nalkur Post & Village, Brahmavara Taluk', { align: 'center', width: 515 })
       .text('Udupi District, Karnataka-576234', { align: 'center', width: 515 });
       
    doc.moveDown(0.5);
    doc.moveTo(40, doc.y).lineTo(555, doc.y)
       .strokeColor(primaryColor).lineWidth(1.2).stroke();
       
    contentStartY = doc.y + 12;
  }

  // ── Certificate Title ─────────────────────────────────────────────────
  const certTitle = resolveVars(template.title || template.name, vars);
  doc.y = contentStartY + 25;

  doc.fillColor(primaryColor)
     .font(isBold ? 'Times-Bold' : 'Times-Roman') // Title is always bold/classic styled
     .fontSize(22)
     .text(certTitle.toUpperCase(), 40, doc.y, { align: 'center', width: 515 });

  doc.moveDown(0.4);

  // Elegant decorative scroll/line below title
  const lineY = doc.y;
  doc.moveTo(180, lineY).lineTo(415, lineY)
     .strokeColor(primaryColor).lineWidth(1.5).stroke();
  doc.moveTo(220, lineY + 3).lineTo(375, lineY + 3)
     .strokeColor(primaryColor).lineWidth(0.6).stroke();
  
  doc.moveDown(1.5);

  // ── Header text (optional) ────────────────────────────────────────────
  if (template.headerText) {
    const headerResolved = resolveVars(stripHtml(template.headerText), vars);
    doc.fillColor([100, 116, 139])
       .font('Helvetica-Oblique')
       .fontSize(10)
       .text(headerResolved, 40, doc.y, { align: 'center', width: 515 });
    doc.moveDown(1.2);
  }

  // ── Main body content ─────────────────────────────────────────────────
  const bodyText = resolveVars(stripHtml(template.content), vars);
  const bodyFontSize = template.fontSize || 12;
  const bodyAlign = template.textAlign || 'justify';
  
  // Calculate lineGap from lineHeight parameter
  // Standard text height is roughly 1.2 * fontSize. We scale that with the lineHeight factor.
  const lineGap = Math.max(2, (template.lineHeight || 1.8) * bodyFontSize - (1.2 * bodyFontSize));

  doc.fillColor([15, 23, 42])
     .font(docFont)
     .fontSize(bodyFontSize)
     .text(bodyText, 55, doc.y, {
       align: bodyAlign,
       width: 485,
       lineGap: lineGap,
     });

  // Dynamic Spacing Before Signature
  const spacingVal = template.spacingBeforeSignature !== undefined ? template.spacingBeforeSignature : 60;
  doc.y += spacingVal;
  
  // Ensure signature fits on A4 page 1 (height: 842pt)
  if (doc.y > 690) {
    doc.y = 690;
  }

  // ── Signature area ────────────────────────────────────────────────────
  const sigBuf = template.signatureUrl ? await fetchImageBuffer(template.signatureUrl) : null;
  const sigY   = doc.y;

  if (sigBuf) {
    safePlaceImage(doc, sigBuf, 390, sigY - 35, { width: 110, height: 45 });
  } else {
    // Placeholder line
    doc.moveTo(370, sigY + 10).lineTo(500, sigY + 10)
       .strokeColor([203, 213, 225]).lineWidth(0.8).stroke();
  }

  // Principal Details
  doc.fillColor([15, 23, 42])
     .font('Helvetica-Bold')
     .fontSize(10)
     .text(vars.principalName || '—', 370, sigY + 15, { width: 130, align: 'center' });
  
  doc.fillColor([100, 116, 139])
     .font('Helvetica')
     .fontSize(9)
     .text(vars.principalDesignation || 'Principal', 370, sigY + 28, { width: 130, align: 'center' });

  // Date (left side, aligned with signature)
  doc.fillColor([100, 116, 139])
     .font('Helvetica')
     .fontSize(9)
     .text(`Date: ${vars.date}`, 65, sigY + 15, { width: 200 });

  doc.y = sigY + 60;

  // ── Footer ────────────────────────────────────────────────────────────
  if (template.footerText) {
    const footerResolved = resolveVars(stripHtml(template.footerText), vars);
    doc.moveTo(40, doc.y).lineTo(555, doc.y)
       .strokeColor([226, 232, 240]).lineWidth(0.5).stroke();
    doc.moveDown(0.6);
    
    const fAlign = template.footerAlign || 'center';
    doc.fillColor([100, 116, 139])
       .font('Helvetica-Oblique')
       .fontSize(8.5)
       .text(footerResolved, 40, doc.y, { align: fAlign, width: 515 });
  }

  // Stamp area watermark text (subtle)
  doc.y = 785;
  doc.fillColor([203, 213, 225])
     .font('Helvetica')
     .fontSize(7)
     .text(
       `This is a computer-generated certificate. · ${school?.schoolName || 'School'} · Issued: ${vars.date}`,
       40, doc.y,
       { align: 'center', width: 515 }
     );

  return doc;
}

module.exports = { generateCertificatePDF, buildVariables, resolveVars };
