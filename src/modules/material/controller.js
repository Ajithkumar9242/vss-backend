const MaterialService = require('./service');
const ApiResponse = require('../../utils/apiResponse');

class MaterialController {
  static async create(req, res, next) {
    try { return ApiResponse.created(res, await MaterialService.create(req.body, req.user), 'Material uploaded'); }
    catch (e) { next(e); }
  }
  static async getAll(req, res, next) {
    try { return ApiResponse.success(res, await MaterialService.getAll(req.query, req.user)); }
    catch (e) { next(e); }
  }
  static async getByClass(req, res, next) {
    try { return ApiResponse.success(res, await MaterialService.getByClass(req.params.classId)); }
    catch (e) { next(e); }
  }
  static async getById(req, res, next) {
    try { return ApiResponse.success(res, await MaterialService.getById(req.params.id)); }
    catch (e) { next(e); }
  }
  static async remove(req, res, next) {
    try { return ApiResponse.success(res, await MaterialService.remove(req.params.id, req.user), 'Material deleted'); }
    catch (e) { next(e); }
  }
}

module.exports = MaterialController;
