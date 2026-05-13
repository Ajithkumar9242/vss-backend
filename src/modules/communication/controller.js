const CommunicationService = require('./service');
const ApiResponse = require('../../utils/apiResponse');

class CommunicationController {
  static async send(req, res, next) {
    try {
      const data = { ...req.body, sentBy: req.user._id };
      const message = await CommunicationService.send(data);
      return ApiResponse.created(res, message, 'Message sent successfully');
    } catch (error) {
      next(error);
    }
  }

  static async getAll(req, res, next) {
    try {
      const { page, limit, targetType } = req.query;
      const data = await CommunicationService.getAll({
        page: parseInt(page) || 1,
        limit: parseInt(limit) || 20,
        targetType,
      });
      return ApiResponse.success(res, data, 'Messages fetched');
    } catch (error) {
      next(error);
    }
  }

  static async getById(req, res, next) {
    try {
      const message = await CommunicationService.getById(req.params.id);
      return ApiResponse.success(res, message, 'Message details fetched');
    } catch (error) {
      next(error);
    }
  }
}

module.exports = CommunicationController;
