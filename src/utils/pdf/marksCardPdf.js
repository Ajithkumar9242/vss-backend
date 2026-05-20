'use strict';

const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');

const Student = require('../../models/Student');
const Exam = require('../../models/Exam');
const Mark = require('../../models/Mark');
const SchoolSetting = require('../../models/SchoolSetting');
const AcademicYear = require('../../models/AcademicYear');
const AppError = require('../AppError');

const FONT_REGULAR = path.join(__dirname, '..', 'Roboto-Regular.ttf');
const FONT_BOLD = path.join(__dirname, '..', 'Roboto-Bold.ttf');
const VSS_LOGO_PATH = path.join(__dirname, 'assets', 'vss-logo.png');
const CBSE_LOGO_PATH = path.join(__dirname, 'assets', 'cbse-logo.png');

const BLUE = '#1f4e9d';
const DEEP_BLUE = '#173b78';
const LIGHT_BLUE = '#dce9fb';
const PALE_BLUE = '#eef5ff';
const BORDER = '#2f5597';
const TEXT = '#111827';
const MUTED = '#4b5563';

const SCHOLASTIC_COMPONENTS = {
  term1: [
    { key: 'periodic', label: 'Periodic Test', max: 10 },
    { key: 'notebook', label: 'Notebook', max: 5 },
    { key: 'sea', label: 'SEA', max: 5 },
    { key: 'halfYearly', label: 'Half Yearly', max: 80 },
  ],
  term2: [
    { key: 'periodic', label: 'Periodic Test', max: 10 },
    { key: 'notebook', label: 'Notebook', max: 5 },
    { key: 'sea', label: 'SEA', max: 5 },
    { key: 'yearly', label: 'Yearly Exam', max: 80 },
  ],
};

const ADDITIONAL_SUBJECTS = ['General Knowledge', 'Computer', 'Abacus'];
const CO_SCHOLASTIC = [
  'Work Education',
  'Art Education',
  'Health & Physical Education',
  'Scientific Skills',
  'Social Skills',
  'Yoga',
  'Sports',
];
const DISCIPLINE = [
  'Regularity & Punctuality',
  'Sincerity',
  'Behavior and Values',
  'Attitude towards Teachers',
  'Attitude towards Schoolmates',
  'Attitude towards School',
];

const registerFonts = (doc) => {
  try { doc.registerFont('Roboto', FONT_REGULAR); } catch { /* ignore */ }
  try { doc.registerFont('Roboto-Bold', FONT_BOLD); } catch { /* ignore */ }
};

const imageIfExists = (doc, filePath, x, y, fit) => {
  try {
    if (fs.existsSync(filePath)) doc.image(filePath, x, y, { fit, align: 'center', valign: 'center' });
  } catch { /* ignore invalid asset */ }
};

const clean = (value, fallback = '') => {
  if (value === undefined || value === null || value === '') return fallback;
  return String(value);
};

const formatDate = (value) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

const mm = (value, max) => {
  if (value === undefined || value === null || value === '') return '';
  return Number.isInteger(value) ? String(value) : Number(value).toFixed(value % 1 === 0 ? 0 : 1);
};

const normalizeMark = (mark, targetMax) => {
  if (!mark) return '';
  const sourceMax = mark.maxMarks || targetMax || 100;
  if (!sourceMax) return '';
  return Math.round((mark.marksObtained / sourceMax) * targetMax * 10) / 10;
};

const gradeFromPercent = (percent) => {
  if (percent === null || percent === undefined || Number.isNaN(percent)) return '';
  if (percent >= 91) return 'A1';
  if (percent >= 81) return 'A2';
  if (percent >= 71) return 'B1';
  if (percent >= 61) return 'B2';
  if (percent >= 51) return 'C1';
  if (percent >= 41) return 'C2';
  if (percent >= 33) return 'D';
  return 'E';
};

const isAdditionalSubject = (name) =>
  ADDITIONAL_SUBJECTS.some((subject) => subject.toLowerCase() === clean(name).trim().toLowerCase());

const rowPercent = (row) => {
  let obtained = 0;
  let max = 0;
  ['term1', 'term2'].forEach((termKey) => {
    SCHOLASTIC_COMPONENTS[termKey].forEach((component) => {
      const value = normalizeMark(row[termKey]?.[component.key], component.max);
      if (value !== '') {
        obtained += value;
        max += component.max;
      }
    });
  });
  return max ? (obtained / max) * 100 : null;
};

const line = (doc, x1, y1, x2, y2, color = BORDER, width = 0.5) => {
  doc.strokeColor(color).lineWidth(width).moveTo(x1, y1).lineTo(x2, y2).stroke();
};

const rect = (doc, x, y, w, h, fill, stroke = BORDER, width = 0.5) => {
  if (fill) doc.rect(x, y, w, h).fillAndStroke(fill, stroke);
  else doc.rect(x, y, w, h).stroke(stroke);
  doc.lineWidth(width);
};

const text = (doc, value, x, y, w, h, opts = {}) => {
  const {
    font = 'Roboto',
    size = 7,
    color = TEXT,
    align = 'center',
    valign = 'center',
    bold = false,
  } = opts;
  doc.fillColor(color).font(bold ? 'Roboto-Bold' : font).fontSize(size);
  const textHeight = doc.heightOfString(clean(value), { width: w - 4, align });
  const ty = valign === 'center' ? y + Math.max(1, (h - textHeight) / 2) : y + 3;
  doc.text(clean(value), x + 2, ty, { width: w - 4, height: h - 2, align, lineBreak: true });
};

const sectionTitle = (doc, title, x, y, w) => {
  rect(doc, x, y, w, 18, BLUE, BLUE);
  text(doc, title, x, y, w, 18, { size: 8, color: '#ffffff', bold: true });
  return y + 18;
};

const drawHeader = (doc, school, x, y, w) => {
  rect(doc, x, y, w, 86, '#ffffff', BORDER, 1);
  imageIfExists(doc, VSS_LOGO_PATH, x + 14, y + 12, [60, 60]);
  imageIfExists(doc, CBSE_LOGO_PATH, x + w - 74, y + 12, [60, 60]);

  const schoolName = (school?.schoolName || 'V.S.S ENGLISH MEDIUM SCHOOL').toUpperCase();
  const address = school?.contact?.address || school?.address || 'Muddur, Nalkur Post, Brahmavar Tq, Udupi district- 576234';
  const phone = school?.contact?.phone || school?.phone || '';
  const email = school?.contact?.email || school?.email || '';

  text(doc, schoolName, x + 86, y + 10, w - 172, 22, { size: 15.5, color: DEEP_BLUE, bold: true });
  text(doc, address, x + 86, y + 34, w - 172, 13, { size: 7.5, color: TEXT });
  text(doc, phone ? `Ph: ${phone}` : '', x + 86, y + 48, w - 172, 12, { size: 7, color: MUTED });
  text(doc, email || '', x + 86, y + 61, w - 172, 12, { size: 7, color: MUTED });
  return y + 93;
};

const drawReportTitle = (doc, academicYear, x, y, w) => {
  rect(doc, x, y, w, 20, BLUE, BLUE);
  text(doc, `PROGRESS REPORT${academicYear ? ` ${academicYear}` : ''}`, x, y, w, 20, {
    size: 10,
    color: '#ffffff',
    bold: true,
  });
  return y + 24;
};

const drawStudentInfo = (doc, data, x, y, w) => {
  y = sectionTitle(doc, 'STUDENT INFORMATION', x, y, w);
  const rows = [
    ['Student Name', data.student.name, 'Class', data.className],
    ['Section', data.sectionName, 'Admission Number', data.admissionNo],
    ['Father/Guardian Name', data.fatherName, 'Mother Name', data.motherName],
    ['Date of Birth', data.dob, 'Academic Year', data.academicYear],
  ];
  const colW = [105, 165, 105, w - 375];
  for (const row of rows) {
    let cx = x;
    row.forEach((cell, index) => {
      const isLabel = index % 2 === 0;
      rect(doc, cx, y, colW[index], 18, isLabel ? PALE_BLUE : '#ffffff');
      text(doc, cell, cx, y, colW[index], 18, {
        size: 7.5,
        align: isLabel ? 'left' : 'left',
        bold: isLabel,
      });
      cx += colW[index];
    });
    y += 18;
  }
  return y + 8;
};

const findComponentKey = (examName) => {
  const name = (examName || '').toLowerCase();
  if (name.includes('notebook') || name.includes('note book')) return 'notebook';
  if (name.includes('sea') || name.includes('subject enrichment')) return 'sea';
  if (name.includes('half') || name.includes('mid')) return 'halfYearly';
  if (name.includes('yearly') || name.includes('annual') || name.includes('final')) return 'yearly';
  if (name.includes('periodic') || name.includes('unit') || name.includes('pt')) return 'periodic';
  return null;
};

const findTermKey = (examName, fallbackTerm = null) => {
  const name = (examName || '').toLowerCase();
  if (fallbackTerm === 'term1' || fallbackTerm === 'term2') return fallbackTerm;
  if (name.includes('term 1') || name.includes('term-i') || name.includes('term i') || name.includes('half')) return 'term1';
  if (name.includes('term 2') || name.includes('term-ii') || name.includes('term ii') || name.includes('yearly') || name.includes('annual') || name.includes('final')) return 'term2';
  return null;
};

const buildSubjectRows = ({ student, exams, marks, term }) => {
  const subjectMap = new Map();
  exams.forEach((exam) => {
    (exam.subjects || []).forEach((subject) => {
      if (subject?._id) subjectMap.set(subject._id.toString(), subject);
    });
  });
  marks.forEach((mark) => {
    const subject = mark.subjectId;
    if (subject?._id) subjectMap.set(subject._id.toString(), subject);
  });

  const rows = [...subjectMap.values()]
    .sort((a, b) => clean(a.name).localeCompare(clean(b.name)))
    .map((subject) => ({
      subject,
      term1: {},
      term2: {},
    }));

  const bySubject = new Map(rows.map((row) => [row.subject._id.toString(), row]));
  const examById = new Map(exams.map((exam) => [exam._id.toString(), exam]));

  marks.forEach((mark) => {
    const exam = examById.get(mark.examId?._id?.toString?.() || mark.examId?.toString?.());
    const subjectId = mark.subjectId?._id?.toString();
    if (!exam || !subjectId || !bySubject.has(subjectId)) return;

    const termKey = findTermKey(exam.name, term);
    const componentKey = findComponentKey(exam.name);
    if (!termKey || !componentKey) return;

    bySubject.get(subjectId)[termKey][componentKey] = mark;
  });

  if (!rows.length) {
    return [{
      subject: { name: student.classId?.name ? 'No marks entered' : 'Subjects' },
      term1: {},
      term2: {},
    }];
  }

  return rows;
};

const drawScholasticTable = (doc, rows, x, y, w) => {
  const subjectW = 90;
  const componentW = 38;
  const totalW = 36;
  const gradeW = 30;
  const termW = componentW * 4 + totalW + gradeW;
  const h1 = 18;
  const h2 = 26;
  const rowH = 20;
  const bottomY = doc.page.height - 116;

  const drawTableHeader = (currentY, includeTitle = true) => {
    if (includeTitle) currentY = sectionTitle(doc, 'SCHOLASTIC AREAS', x, currentY, w);

    rect(doc, x, currentY, subjectW, h1 + h2, LIGHT_BLUE);
    text(doc, 'Subject', x, currentY, subjectW, h1 + h2, { size: 8, bold: true });
    rect(doc, x + subjectW, currentY, termW, h1, LIGHT_BLUE);
    text(doc, 'Term 1', x + subjectW, currentY, termW, h1, { size: 8, bold: true });
    rect(doc, x + subjectW + termW, currentY, termW, h1, LIGHT_BLUE);
    text(doc, 'Term 2', x + subjectW + termW, currentY, termW, h1, { size: 8, bold: true });
    currentY += h1;

    let hx = x + subjectW;
    [...SCHOLASTIC_COMPONENTS.term1, { key: 'total', label: 'Total', max: 100 }, { key: 'grade', label: 'Grade' },
     ...SCHOLASTIC_COMPONENTS.term2, { key: 'total', label: 'Total', max: 100 }, { key: 'grade', label: 'Grade' }]
      .forEach((col) => {
        const cw = col.key === 'total' ? totalW : col.key === 'grade' ? gradeW : componentW;
        rect(doc, hx, currentY, cw, h2, LIGHT_BLUE);
        const label = col.max ? `${col.label}\n(${col.max})` : col.label;
        text(doc, label, hx, currentY, cw, h2, { size: 6.2, bold: true });
        hx += cw;
      });
    return currentY + h2;
  };

  y = drawTableHeader(y, true);

  let grandObtained = 0;
  let grandMax = 0;

  rows.forEach((row) => {
    if (y + rowH > bottomY) {
      doc.addPage();
      y = drawTableHeader(24, true);
    }

    rect(doc, x, y, subjectW, rowH, '#ffffff');
    text(doc, row.subject.name, x, y, subjectW, rowH, { size: 7.2, align: 'left', bold: true });
    let cx = x + subjectW;

    ['term1', 'term2'].forEach((termKey) => {
      let total = 0;
      let hasAny = false;
      SCHOLASTIC_COMPONENTS[termKey].forEach((component) => {
        const value = normalizeMark(row[termKey][component.key], component.max);
        if (value !== '') {
          total += value;
          hasAny = true;
        }
        rect(doc, cx, y, componentW, rowH, '#ffffff');
        text(doc, mm(value), cx, y, componentW, rowH, { size: 7 });
        cx += componentW;
      });

      const percent = hasAny ? total : null;
      const grade = hasAny ? gradeFromPercent(percent) : '';
      if (hasAny) {
        grandObtained += total;
        grandMax += 100;
      }
      rect(doc, cx, y, totalW, rowH, '#ffffff');
      text(doc, hasAny ? mm(total) : '', cx, y, totalW, rowH, { size: 7, bold: true });
      cx += totalW;
      rect(doc, cx, y, gradeW, rowH, '#ffffff');
      text(doc, grade, cx, y, gradeW, rowH, { size: 7, bold: true });
      cx += gradeW;
    });
    y += rowH;
  });

  const percentage = grandMax ? Math.round((grandObtained / grandMax) * 1000) / 10 : null;
  const overallGrade = gradeFromPercent(percentage);

  if (y + 36 > bottomY) {
    doc.addPage();
    y = 24;
  }

  rect(doc, x, y, subjectW + termW * 2, 18, PALE_BLUE);
  text(doc, `Total: ${grandMax ? `${mm(grandObtained)} / ${grandMax}` : ''}`, x, y, subjectW + termW * 2, 18, { size: 8, bold: true, align: 'right' });
  y += 18;
  rect(doc, x, y, subjectW + termW, 18, '#ffffff');
  text(doc, `Percentage: ${percentage !== null ? `${mm(percentage)}%` : ''}`, x, y, subjectW + termW, 18, { size: 8, bold: true });
  rect(doc, x + subjectW + termW, y, termW, 18, '#ffffff');
  text(doc, `Overall Grade: ${overallGrade}`, x + subjectW + termW, y, termW, 18, { size: 8, bold: true });

  return y + 26;
};

const drawAdditionalSubjects = (doc, items, x, y, w) => {
  y = sectionTitle(doc, 'ADDITIONAL SUBJECTS', x, y, w);
  const subjectW = 140;
  const colW = (w - subjectW) / 6;
  const rowH = 18;
  const widths = [subjectW, colW, colW, colW, colW, colW, colW];
  const headers = ['Subject', 'Term 1', '%', 'Grade', 'Term 2', '%', 'Grade'];
  let cx = x;
  widths.forEach((cw, index) => {
    rect(doc, cx, y, cw, rowH, LIGHT_BLUE);
    text(doc, headers[index], cx, y, cw, rowH, { size: 7, bold: true });
    cx += cw;
  });
  y += rowH;

  items.forEach((item) => {
    cx = x;
    const cells = [
      item.label,
      item.term1Text,
      item.term1Percent !== null ? mm(item.term1Percent) : '',
      item.term1Grade,
      item.term2Text,
      item.term2Percent !== null ? mm(item.term2Percent) : '',
      item.term2Grade,
    ];
    widths.forEach((cw, index) => {
      rect(doc, cx, y, cw, rowH, '#ffffff');
      text(doc, cells[index], cx, y, cw, rowH, {
        size: 7,
        align: index === 0 ? 'left' : 'center',
        bold: index === 0 || index === 3 || index === 6,
      });
      cx += cw;
    });
    y += rowH;
  });
  return y + 8;
};

const drawGradeList = (doc, title, items, x, y, w) => {
  y = sectionTitle(doc, title, x, y, w);
  const rowH = 18;
  const labelW = w - 100;
  const termW = 50;

  rect(doc, x, y, labelW, rowH, LIGHT_BLUE);
  text(doc, title, x, y, labelW, rowH, { size: 7, bold: true });
  rect(doc, x + labelW, y, termW, rowH, LIGHT_BLUE);
  text(doc, 'Term 1', x + labelW, y, termW, rowH, { size: 7, bold: true });
  rect(doc, x + labelW + termW, y, termW, rowH, LIGHT_BLUE);
  text(doc, 'Term 2', x + labelW + termW, y, termW, rowH, { size: 7, bold: true });
  y += rowH;

  for (const rawItem of items) {
    const item = typeof rawItem === 'string' ? { label: rawItem, term1Grade: '', term2Grade: '' } : rawItem;
    rect(doc, x, y, labelW, rowH, '#ffffff');
    text(doc, item.label, x, y, labelW, rowH, { size: 7.2, align: 'left' });
    rect(doc, x + labelW, y, termW, rowH, '#ffffff');
    text(doc, item.term1Grade || '', x + labelW, y, termW, rowH, { size: 7.2, bold: true });
    rect(doc, x + labelW + termW, y, termW, rowH, '#ffffff');
    text(doc, item.term2Grade || '', x + labelW + termW, y, termW, rowH, { size: 7.2, bold: true });
    y += rowH;
  }
  return y + 8;
};

const buildAdditionalItems = (subjectRows) => {
  const rowByName = new Map(subjectRows.map((row) => [clean(row.subject.name).trim().toLowerCase(), row]));
  return ADDITIONAL_SUBJECTS.map((label) => {
    const row = rowByName.get(label.toLowerCase());
    if (!row || rowPercent(row) === null) return null;
    const termSummary = (termKey) => {
      let obtained = 0;
      let max = 0;
      SCHOLASTIC_COMPONENTS[termKey].forEach((component) => {
        const value = normalizeMark(row[termKey]?.[component.key], component.max);
        if (value !== '') {
          obtained += value;
          max += component.max;
        }
      });
      const percent = max ? Math.round((obtained / max) * 1000) / 10 : null;
      return {
        text: max ? `${mm(obtained)} (${max})` : '',
        percent,
        grade: gradeFromPercent(percent),
      };
    };
    const term1 = termSummary('term1');
    const term2 = termSummary('term2');
    return {
      label,
      term1Text: term1.text,
      term1Percent: term1.percent,
      term1Grade: term1.grade,
      term2Text: term2.text,
      term2Percent: term2.percent,
      term2Grade: term2.grade,
    };
  }).filter(Boolean);
};

const drawFooter = (doc, x, y, w) => {
  const h = 62;
  rect(doc, x, y, w, h, '#ffffff');
  const colW = w / 3;
  for (let i = 1; i < 3; i += 1) line(doc, x + colW * i, y, x + colW * i, y + h);
  ['Signature of Class Teacher', 'Institution Seal', 'Principal Signature'].forEach((label, index) => {
    const cx = x + colW * index;
    line(doc, cx + 22, y + 34, cx + colW - 22, y + 34, '#6b7280', 0.5);
    text(doc, label, cx, y + 39, colW, 16, { size: 7.5, bold: true });
  });
  return y + h;
};

const getMarksCardData = async ({ studentId, academicYearId, term, examId }) => {
  const student = await Student.findById(studentId)
    .populate('classId', 'name code')
    .populate('sectionId', 'name')
    .populate('parentId', 'name')
    .lean();
  if (!student) throw new AppError('Student not found', 404);

  const school = await SchoolSetting.findOne().lean();
  let academicYear = null;
  if (academicYearId) academicYear = await AcademicYear.findById(academicYearId).lean();
  if (!academicYear) academicYear = await AcademicYear.findOne({ isActive: true }).lean();

  const examQuery = { classId: student.classId?._id || student.classId, isActive: { $ne: false } };
  if (academicYearId) examQuery.academicYearId = academicYearId;
  if (examId) examQuery._id = examId;

  const exams = await Exam.find(examQuery)
    .populate('subjects', 'name code')
    .sort({ startDate: 1, createdAt: 1 })
    .lean();

  const examIds = exams.map((exam) => exam._id);
  const marks = examIds.length
    ? await Mark.find({ studentId, examId: { $in: examIds } })
      .populate('subjectId', 'name code')
      .lean()
    : [];

  return {
    school,
    student,
    className: student.classId?.name || student.classId?.code || '',
    sectionName: student.sectionId?.name || '',
    admissionNo: student.admissionNo || student.admissionNumber || student.registerNo || '',
    fatherName: student.parentName || student.parentId?.name || '',
    motherName: student.motherName || '',
    dob: formatDate(student.dateOfBirth),
    academicYear: academicYear?.name || '',
    exams,
    marks,
    subjectRows: buildSubjectRows({ student, exams, marks, term }),
  };
};

const generateMarksCardPdf = async ({ res, studentId, academicYearId = null, term = null, examId = null }) => {
  const data = await getMarksCardData({ studentId, academicYearId, term, examId });
  const safeName = clean(data.student.name, 'student').replace(/[^a-z0-9]+/gi, '_').replace(/^_|_$/g, '');

  const doc = new PDFDocument({ size: 'A4', margin: 24, bufferPages: true });
  registerFonts(doc);

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="marks_card_${safeName || studentId}.pdf"`);
  doc.pipe(res);

  const x = 24;
  const w = doc.page.width - 48;
  let y = 20;
  const scholasticRows = data.subjectRows.filter((row) => !isAdditionalSubject(row.subject.name));
  const additionalItems = buildAdditionalItems(data.subjectRows);

  y = drawHeader(doc, data.school, x, y, w);
  y = drawReportTitle(doc, data.academicYear, x, y, w);
  y = drawStudentInfo(doc, data, x, y, w);
  y = drawScholasticTable(doc, scholasticRows.length ? scholasticRows : data.subjectRows, x, y, w);

  if (y > 610) {
    doc.addPage();
    y = 24;
  }

  if (additionalItems.length) {
    y = drawAdditionalSubjects(doc, additionalItems, x, y, w);
  }
  y = drawGradeList(doc, 'CO-SCHOLASTIC AREAS', CO_SCHOLASTIC, x, y, w);
  y = drawGradeList(doc, 'DISCIPLINE', DISCIPLINE, x, y, w);

  if (y > 760) {
    doc.addPage();
    y = 24;
  }
  drawFooter(doc, x, Math.max(y + 8, doc.page.height - 104), w);

  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i += 1) {
    doc.switchToPage(i);
    text(doc, `Page ${i + 1} of ${range.count}`, x, doc.page.height - 20, w, 10, { size: 6.5, color: MUTED });
  }

  doc.end();
};

module.exports = {
  generateMarksCardPdf,
  getMarksCardData,
};
