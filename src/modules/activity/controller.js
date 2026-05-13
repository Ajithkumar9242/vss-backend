const ActivityService = require('./service');
const ApiResponse = require('../../utils/apiResponse');

class ActivityController {
  static async getByStudent(req, res, next) {
    try {
      const { page, limit } = req.query;
      const data = await ActivityService.getByStudent(req.params.studentId, {
        page: parseInt(page) || 1,
        limit: parseInt(limit) || 30,
      });
      return ApiResponse.success(res, data, 'Student activity fetched');
    } catch (error) {
      next(error);
    }
  }

  static async getRecent(req, res, next) {
    try {
      const { page, limit } = req.query;
      const data = await ActivityService.getRecent({
        page: parseInt(page) || 1,
        limit: parseInt(limit) || 50,
      });
      return ApiResponse.success(res, data, 'Recent activity fetched');
    } catch (error) {
      next(error);
    }
  }
}

module.exports = ActivityController;
