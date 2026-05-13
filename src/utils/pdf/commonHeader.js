'use strict';

/**
 * commonHeader.js
 * ─────────────────────────────────────────────────────────────
 * Exports TWO header helpers for PDFKit documents:
 *
 *  1) drawSingleLogoHeader(doc, school, opts)
 *     — School logo only on the LEFT.
 *     — Used by: Fee Invoice, Fee Receipt, POS Invoice.
 *
 *  2) drawDualLogoHeaderExam(doc, school, opts)
 *     — School logo LEFT, VSS logo RIGHT.
 *     — Used by: Exam Marks / Results PDF only.
 *
 * Both helpers:
 *  - Register Roboto fonts (safe to call repeatedly).
 *  - Draw a dark-navy band behind the header.
 *  - Centre school name / address / phone / email text.
 *  - Return the Y position after the header so callers can set doc.y.
 *  - Never crash if a logo fails to load — they just skip the image.
 */

const path = require('path');
const fs   = require('fs');
const axios = require('axios');

const VSS_LOGO_PATH = path.join(__dirname, 'assets', 'vss-logo.png');

// Roboto fonts live one level up (src/utils/)
const FONT_REGULAR = path.join(__dirname, '..', 'Roboto-Regular.ttf');
const FONT_BOLD    = path.join(__dirname, '..', 'Roboto-Bold.ttf');

// Primary navy colour used across all PDFs
const PRIMARY_RGB  = [27, 58, 92];   // #1B3A5C
const WHITE_RGB    = [255, 255, 255];
const SLATE_RGB    = [203, 213, 225]; // slate-300, for sub-lines on dark band

const BAND_H       = 95;             // fixed header band height (pts)
const MARGIN       = 40;

// ─── Shared internals ─────────────────────────────────────────

/** Safely register Roboto fonts (ignores "already registered" errors). */
function registerFonts(doc) {
  try { doc.registerFont('Roboto',      FONT_REGULAR); } catch { /* already registered */ }
  try { doc.registerFont('Roboto-Bold', FONT_BOLD);    } catch { /* already registered */ }
}

/**
 * Fetch a logo from a public URL → Buffer.
 * Returns null on any failure (timeout, 4xx/5xx, network error).
 */
async function fetchLogoBuffer(logoUrl) {
  if (!logoUrl || typeof logoUrl !== 'string') return null;
  try {
    const response = await axios.get(logoUrl, {
      responseType: 'arraybuffer',
      timeout: 5000,
    });
    return Buffer.from(response.data);
  } catch {
    return null;
  }
}

/** Load VSS logo from local disk. Returns null if file is absent. */
function loadVssLogo() {
  try {
    if (fs.existsSync(VSS_LOGO_PATH)) return fs.readFileSync(VSS_LOGO_PATH);
    return null;
  } catch {
    return null;
  }
}

/**
 * Draw background band + centre text + divider.
 * Logos are placed by the caller (school logo left, optional VSS right).
 * Returns the Y position immediately after the band.
 *
 * @param {PDFDocument} doc
 * @param {Object}      school      - SchoolSetting plain object
 * @param {number}      startY      - top of the band
 * @param {number}      logoSize    - size of the logo box (both sides)
 * @param {boolean}     hasRightLogo - whether a right-side logo occupies space
 */
function drawBandAndText(doc, school, startY, logoSize, hasRightLogo) {
  const pageWidth = doc.page.width;

  // ── Background band ──────────────────────────────────────────
  doc.save()
     .rect(0, startY - 5, pageWidth, BAND_H)
     .fill(PRIMARY_RGB);
  doc.restore();

  // ── Text area calculation ────────────────────────────────────
  // Left text starts after the school logo
  const textLeft  = MARGIN + logoSize + 8;
  // Right text boundary — shrink inward if there's a right logo
  const textRight = hasRightLogo
    ? (pageWidth - MARGIN - logoSize - 8)
    : (pageWidth - MARGIN - 8);
  const textWidth = Math.max(1, textRight - textLeft);

  const schoolName  = school?.schoolName || school?.name || 'VMS School';
  const schoolAddr  = school?.contact?.address || school?.address || '';
  const schoolPhone = school?.contact?.phone   || school?.phone   || '';
  const schoolEmail = school?.contact?.email   || school?.email   || '';

  let ty = startY + 12;

  doc.fillColor(WHITE_RGB).font('Roboto-Bold').fontSize(14)
     .text(schoolName, textLeft, ty, { width: textWidth, align: 'center', lineBreak: false });
  ty += 18;

  if (schoolAddr) {
    doc.fillColor(SLATE_RGB).font('Roboto').fontSize(8)
       .text(schoolAddr, textLeft, ty, { width: textWidth, align: 'center', lineBreak: false });
    ty += 11;
  }
  if (schoolPhone) {
    doc.fillColor(SLATE_RGB).font('Roboto').fontSize(8)
       .text(`Ph: ${schoolPhone}`, textLeft, ty, { width: textWidth, align: 'center', lineBreak: false });
    ty += 11;
  }
  if (schoolEmail) {
    doc.fillColor(SLATE_RGB).font('Roboto').fontSize(8)
       .text(schoolEmail, textLeft, ty, { width: textWidth, align: 'center', lineBreak: false });
  }

  // ── Divider ──────────────────────────────────────────────────
  const lineY = startY + BAND_H - 2;
  doc.moveTo(MARGIN, lineY).lineTo(pageWidth - MARGIN, lineY)
     .strokeColor(WHITE_RGB).lineWidth(0.5).stroke();

  return startY + BAND_H;
}

/** Place an image buffer safely (skips on any PDFKit error). */
function placeImage(doc, buf, x, y, size) {
  if (!buf) return;
  try {
    doc.image(buf, x, y, { fit: [size, size], align: 'center', valign: 'center' });
  } catch { /* corrupt / unsupported image — skip silently */ }
}

// ─── PUBLIC API ───────────────────────────────────────────────

/**
 * Draw a header with ONLY the school logo on the left.
 * Used by: Fee Invoice, Fee Receipt, POS Invoice.
 *
 * @param {PDFDocument} doc
 * @param {Object}      school   - SchoolSetting plain object
 * @param {Object}      [opts]
 * @param {number}      [opts.startY=20]   - top Y of band
 * @param {number}      [opts.logoSize=52] - logo box size (pts)
 * @returns {Promise<number>} Y after header
 */
async function drawSingleLogoHeader(doc, school, opts = {}) {
  const { startY = 20, logoSize = 52 } = opts;

  registerFonts(doc);

  const logoUrl      = school?.logoUrl || null;
  const schoolLogoBuf = await fetchLogoBuffer(logoUrl);

  const yAfter = drawBandAndText(doc, school, startY, logoSize, /* hasRightLogo */ false);
  const logoY  = startY + 10;

  // Left: school logo only
  placeImage(doc, schoolLogoBuf, MARGIN, logoY, logoSize);

  return yAfter;
}

/**
 * Draw a header with school logo LEFT and VSS logo RIGHT.
 * Used by: Exam Results / Marks Card PDF only.
 *
 * @param {PDFDocument} doc
 * @param {Object}      school   - SchoolSetting plain object
 * @param {Object}      [opts]
 * @param {number}      [opts.startY=20]   - top Y of band
 * @param {number}      [opts.logoSize=52] - logo box size (pts)
 * @returns {Promise<number>} Y after header
 */
async function drawDualLogoHeaderExam(doc, school, opts = {}) {
  const { startY = 20, logoSize = 52 } = opts;

  registerFonts(doc);

  const logoUrl       = school?.logoUrl || null;
  const [schoolLogoBuf, vssLogoBuf] = await Promise.all([
    fetchLogoBuffer(logoUrl),
    Promise.resolve(loadVssLogo()),
  ]);

  const yAfter = drawBandAndText(doc, school, startY, logoSize, /* hasRightLogo */ true);
  const logoY  = startY + 10;
  const rightX = doc.page.width - MARGIN - logoSize;

  // Left: school logo
  placeImage(doc, schoolLogoBuf, MARGIN, logoY, logoSize);

  // Right: VSS logo
  placeImage(doc, vssLogoBuf, rightX, logoY, logoSize);

  return yAfter;
}

// Keep legacy alias so any stale require('.../commonHeader').drawDualLogoHeader
// doesn't crash the process during a hot-reload — it will just behave like single.
const drawDualLogoHeader = drawSingleLogoHeader;

module.exports = {
  drawSingleLogoHeader,
  drawDualLogoHeaderExam,
  drawDualLogoHeader,       // legacy alias
};
