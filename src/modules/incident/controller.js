const IncidentService = require('./service');
const ApiResponse = require('../../utils/apiResponse');

class IncidentController {
  static async create(req, res, next) {
    try {
      const incident = await IncidentService.create(req.body, req.user._id);
      return ApiResponse.created(res, incident, 'Incident reported');
    } catch (e) { next(e); }
  }

  static async updateAction(req, res, next) {
    try {
      const incident = await IncidentService.updateAction(req.params.id, req.body.actionTaken);
      return ApiResponse.success(res, incident, 'Action updated');
    } catch (e) { next(e); }
  }

  static async getByStudent(req, res, next) {
    try {
      const incidents = await IncidentService.getByStudent(req.params.studentId);
      return ApiResponse.success(res, incidents, 'Incidents fetched');
    } catch (e) { next(e); }
  }

  static async getAll(req, res, next) {
    try {
      const result = await IncidentService.getAll(req.query);
      return ApiResponse.success(res, result, 'Incidents fetched');
    } catch (e) { next(e); }
  }
}

module.exports = IncidentController;
