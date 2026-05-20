const ExamService = require('./service');
const ApiResponse = require('../../utils/apiResponse');

class ExamController {
  static async health(req, res, next) {
    try {
      return ApiResponse.success(res, await ExamService.getModuleStatus());
    } catch (e) { next(e); }
  }

  static async getSubjectsForClass(req, res, next) {
    try {
      const subjects = await ExamService.getSubjectsForClass(req.query.classId);
      return ApiResponse.success(res, subjects, 'Subjects fetched');
    } catch (e) { next(e); }
  }

  // ── EXAM CRUD ──────────────────────────────────────────────

  static async createExam(req, res, next) {
    try {
      const exam = await ExamService.createExam(req.body);
      return ApiResponse.created(res, exam, 'Exam created');
    } catch (e) { next(e); }
  }

  static async getExams(req, res, next) {
    try {
      const { classId, academicYearId, academicYear, status } = req.query;
      const exams = await ExamService.getExams({
        classId,
        academicYearId: academicYearId || academicYear,
        status,
      });
      return ApiResponse.success(res, exams, 'Exams fetched');
    } catch (e) { next(e); }
  }

  static async getExamById(req, res, next) {
    try {
      return ApiResponse.success(res, await ExamService.getExamById(req.params.id));
    } catch (e) { next(e); }
  }

  static async updateExam(req, res, next) {
    try {
      return ApiResponse.success(res, await ExamService.updateExam(req.params.id, req.body, req.user), 'Exam updated');
    } catch (e) { next(e); }
  }

  static async deleteExam(req, res, next) {
    try {
      return ApiResponse.success(res, await ExamService.deleteExam(req.params.id), 'Exam deleted');
    } catch (e) { next(e); }
  }

  static async publishExam(req, res, next) {
    try {
      return ApiResponse.success(res, await ExamService.publishExam(req.params.id), 'Exam published');
    } catch (e) { next(e); }
  }

  static async lockExam(req, res, next) {
    try {
      return ApiResponse.success(res, await ExamService.lockExam(req.params.id), 'Exam locked');
    } catch (e) { next(e); }
  }

  // ── MARKS ─────────────────────────────────────────────────

  static async saveMarks(req, res, next) {
    try {
      return ApiResponse.created(res, await ExamService.saveMarks(req.params.examId, req.body.marks, req.user), 'Marks saved');
    } catch (e) { next(e); }
  }

  static async getExamMarks(req, res, next) {
    try {
      return ApiResponse.success(res, await ExamService.getExamMarks(req.params.examId));
    } catch (e) { next(e); }
  }

  // ── RESULTS ───────────────────────────────────────────────

  static async getExamResults(req, res, next) {
    try {
      return ApiResponse.success(res, await ExamService.getExamResults(req.params.examId));
    } catch (e) { next(e); }
  }

  static async getStudentResults(req, res, next) {
    try {
      return ApiResponse.success(res, await ExamService.getStudentResults(req.params.studentId));
    } catch (e) { next(e); }
  }

  // ── PDF ───────────────────────────────────────────────────

  static async getMarksCardPdf(req, res, next) {
    try {
      const { academicYearId, term, examId } = req.query;
      await ExamService.generateMarksCardPdf(req.params.studentId, res, {
        academicYearId: academicYearId || null,
        term: term || null,
        examId: examId || null,
      });
    } catch (e) { next(e); }
  }

}

module.exports = ExamController;
