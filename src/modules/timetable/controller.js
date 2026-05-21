'use strict';

const Timetable = require('../../models/Timetable');
const ApiResponse = require('../../utils/apiResponse');

// ─── GET /api/timetable ─────────────────────────────────────────────────────
// Query: academicYearId, classId, sectionId, dayOfWeek, facultyId
const getAll = async (req, res, next) => {
  try {
    const { academicYearId, classId, sectionId, dayOfWeek, facultyId, term } = req.query;
    const filter = { isActive: true };
    if (academicYearId) filter.academicYearId = academicYearId;
    if (classId)        filter.classId = classId;
    if (sectionId)      filter.sectionId = sectionId;
    if (dayOfWeek)      filter.dayOfWeek = dayOfWeek;
    if (facultyId)      filter.facultyId = facultyId;
    if (term)           filter.term = term;

    const entries = await Timetable.find(filter)
      .populate('classId', 'name code')
      .populate('sectionId', 'name')
      .populate('subjectId', 'name code')
      .populate('facultyId', 'name email')
      .populate('academicYearId', 'name year')
      .sort({ dayOfWeek: 1, periodNo: 1 })
      .lean();

    return ApiResponse.success(res, entries, 'Timetable fetched');
  } catch (err) { next(err); }
};

// ─── GET /api/timetable/class/:classId ─────────────────────────────────────
const getByClass = async (req, res, next) => {
  try {
    const { classId } = req.params;
    const { academicYearId, sectionId, term } = req.query;
    const filter = { classId, isActive: true };
    if (academicYearId) filter.academicYearId = academicYearId;
    if (sectionId)      filter.sectionId = sectionId;
    if (term)           filter.term = term;

    const entries = await Timetable.find(filter)
      .populate('classId', 'name code')
      .populate('sectionId', 'name')
      .populate('subjectId', 'name code')
      .populate('facultyId', 'name email')
      .populate('academicYearId', 'name year')
      .sort({ dayOfWeek: 1, periodNo: 1 })
      .lean();

    return ApiResponse.success(res, entries, 'Class timetable fetched');
  } catch (err) { next(err); }
};

// ─── GET /api/timetable/faculty/:facultyId ──────────────────────────────────
const getByFaculty = async (req, res, next) => {
  try {
    const { facultyId } = req.params;
    const { academicYearId, term } = req.query;
    const filter = { facultyId, isActive: true };
    if (academicYearId) filter.academicYearId = academicYearId;
    if (term)           filter.term = term;

    const entries = await Timetable.find(filter)
      .populate('classId', 'name code')
      .populate('sectionId', 'name')
      .populate('subjectId', 'name code')
      .populate('academicYearId', 'name year')
      .sort({ dayOfWeek: 1, periodNo: 1 })
      .lean();

    return ApiResponse.success(res, entries, 'Faculty timetable fetched');
  } catch (err) { next(err); }
};

// ─── POST /api/timetable ────────────────────────────────────────────────────
const create = async (req, res, next) => {
  try {
    const { academicYearId, classId, sectionId, dayOfWeek, periodNo, startTime, endTime, subjectId, facultyId, room, term } = req.body;

    // Check faculty double-booking
    if (facultyId) {
      const conflict = await Timetable.findOne({ academicYearId, facultyId, dayOfWeek, periodNo, isActive: true });
      if (conflict) {
        return ApiResponse.error(res, `Faculty is already assigned to period ${periodNo} on ${dayOfWeek}`, 409);
      }
    }

    const entry = await Timetable.create({ academicYearId, classId, sectionId, dayOfWeek, periodNo, startTime, endTime, subjectId, facultyId, room: room || '', term: term || 'full' });
    const populated = await Timetable.findById(entry._id)
      .populate('classId', 'name code')
      .populate('sectionId', 'name')
      .populate('subjectId', 'name code')
      .populate('facultyId', 'name email')
      .lean();

    return ApiResponse.success(res, populated, 'Timetable entry created', 201);
  } catch (err) {
    if (err.code === 11000) return ApiResponse.error(res, 'This class period slot already has an entry', 409);
    next(err);
  }
};

// ─── PUT /api/timetable/:id ─────────────────────────────────────────────────
const update = async (req, res, next) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    // Prevent duplicate period if class/day/period changes
    if (updates.facultyId && (updates.dayOfWeek || updates.periodNo)) {
      const existing = await Timetable.findById(id).lean();
      const checkDay = updates.dayOfWeek || existing?.dayOfWeek;
      const checkPeriod = updates.periodNo || existing?.periodNo;
      const checkYear = updates.academicYearId || existing?.academicYearId;
      const conflict = await Timetable.findOne({
        _id: { $ne: id },
        academicYearId: checkYear,
        facultyId: updates.facultyId,
        dayOfWeek: checkDay,
        periodNo: checkPeriod,
        isActive: true,
      });
      if (conflict) return ApiResponse.error(res, `Faculty is already assigned to this slot`, 409);
    }

    const entry = await Timetable.findByIdAndUpdate(id, updates, { new: true, runValidators: true })
      .populate('classId', 'name code')
      .populate('sectionId', 'name')
      .populate('subjectId', 'name code')
      .populate('facultyId', 'name email')
      .lean();

    if (!entry) return ApiResponse.error(res, 'Timetable entry not found', 404);
    return ApiResponse.success(res, entry, 'Timetable entry updated');
  } catch (err) {
    if (err.code === 11000) return ApiResponse.error(res, 'This class period slot already has an entry', 409);
    next(err);
  }
};

// ─── DELETE /api/timetable/:id ──────────────────────────────────────────────
const remove = async (req, res, next) => {
  try {
    const entry = await Timetable.findByIdAndUpdate(
      req.params.id,
      { isActive: false },
      { new: true }
    );
    if (!entry) return ApiResponse.error(res, 'Timetable entry not found', 404);
    return ApiResponse.success(res, null, 'Timetable entry deleted');
  } catch (err) { next(err); }
};

module.exports = { getAll, getByClass, getByFaculty, create, update, remove };
