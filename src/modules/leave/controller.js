const LeaveService = require('./service');
const ApiResponse = require('../../utils/apiResponse');

class LeaveController {
  static async create(req, res, next) {
    try {
      const leave = await LeaveService.create(req.body);
      return ApiResponse.created(res, leave, 'Leave request created');
    } catch (e) { next(e); }
  }

  static async getAll(req, res, next) {
    try {
      const result = await LeaveService.getAll(req.query);
      return ApiResponse.success(res, result, 'Leave requests fetched');
    } catch (e) { next(e); }
  }

  static async approve(req, res, next) {
    try {
      const leave = await LeaveService.approve(req.params.id, req.user._id);
      return ApiResponse.success(res, leave, 'Leave approved');
    } catch (e) { next(e); }
  }

  static async reject(req, res, next) {
    try {
      const leave = await LeaveService.reject(req.params.id, req.user._id, req.body.remarks);
      return ApiResponse.success(res, leave, 'Leave rejected');
    } catch (e) { next(e); }
  }

  static async markOut(req, res, next) {
    try {
      const leave = await LeaveService.markOut(req.params.id);
      return ApiResponse.success(res, leave, 'Marked out');
    } catch (e) { next(e); }
  }

  static async markIn(req, res, next) {
    try {
      const leave = await LeaveService.markIn(req.params.id);
      return ApiResponse.success(res, leave, 'Marked in');
    } catch (e) { next(e); }
  }
}

module.exports = LeaveController;
