const Student = require('../../models/Student');
const Faculty = require('../../models/Faculty');
const Admission = require('../../models/Admission');
const AppError = require('../../utils/AppError');

/**
 * Escape special regex characters to prevent injection.
 * @param {string} str
 * @returns {string}
 */
function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Search Service — global search across entities.
 * Safe against regex injection.
 */
class SearchService {
  /**
   * Search across students, faculty, and admissions.
   * Returns grouped results with per-group limits.
   */
  static async search(query, { limit = 10 } = {}) {
    if (!query || query.trim().length < 2) {
      throw new AppError('Search query must be at least 2 characters', 400);
    }

    // Sanitize against regex injection
    const safeQuery = escapeRegex(query.trim());
    const regex = { $regex: safeQuery, $options: 'i' };

    const [students, faculty, admissions] = await Promise.all([
      Student.find({
        $or: [
          { name: regex },
          { rollNo: regex },
          { parentName: regex },
        ],
      })
        .populate('classId', 'name code')
        .select('name rollNo classId isActive')
        .limit(limit)
        .lean(),

      Faculty.find({
        $or: [
          { name: regex },
          { employeeId: regex },
          { email: regex },
        ],
      })
        .select('name employeeId email designation isActive')
        .limit(limit)
        .lean(),

      Admission.find({
        $or: [
          { studentName: regex },
          { applicationNo: regex },
          { parentName: regex },
        ],
      })
        .populate('classId', 'name code')
        .select('applicationNo studentName classId status')
        .limit(limit)
        .lean(),
    ]);

    return {
      students,
      faculty,
      admissions,
      totalResults: students.length + faculty.length + admissions.length,
    };
  }
}

module.exports = SearchService;
