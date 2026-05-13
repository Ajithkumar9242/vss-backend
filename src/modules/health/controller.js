const HealthService = require('./service');
const ApiResponse = require('../../utils/apiResponse');

class HealthController {
  static async create(req, res, next) {
    try {
      const record = await HealthService.create(req.body, req.user._id);
      return ApiResponse.created(res, record, 'Health record created');
    } catch (e) { next(e); }
  }

  static async getByStudent(req, res, next) {
    try {
      const records = await HealthService.getByStudent(req.params.studentId);
      return ApiResponse.success(res, records, 'Health history fetched');
    } catch (e) { next(e); }
  }

  static async getAll(req, res, next) {
    try {
      const result = await HealthService.getAll(req.query);
      return ApiResponse.success(res, result, 'Health records fetched');
    } catch (e) { next(e); }
  }
}

module.exports = HealthController;
