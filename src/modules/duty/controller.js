const DutyService = require('./service');
const ApiResponse = require('../../utils/apiResponse');

class DutyController {
  static async assign(req, res, next) {
    try {
      const duty = await DutyService.assign(req.body, req.user._id);
      return ApiResponse.created(res, duty, 'Duty assigned');
    } catch (e) { next(e); }
  }

  static async getByDate(req, res, next) {
    try {
      const duties = await DutyService.getByDate(req.query.date);
      return ApiResponse.success(res, duties, 'Duties fetched');
    } catch (e) { next(e); }
  }

  static async getAll(req, res, next) {
    try {
      const result = await DutyService.getAll(req.query);
      return ApiResponse.success(res, result, 'Duties fetched');
    } catch (e) { next(e); }
  }
}

module.exports = DutyController;
