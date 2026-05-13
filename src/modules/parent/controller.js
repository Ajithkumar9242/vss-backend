const ParentService = require('./service');
const ApiResponse = require('../../utils/apiResponse');

class ParentController {
  static async create(req, res, next) {
    try {
      const parent = await ParentService.create(req.body);
      return ApiResponse.created(res, parent, 'Parent created successfully');
    } catch (error) {
      next(error);
    }
  }

  static async getAll(req, res, next) {
    try {
      const { page, limit, search } = req.query;
      const data = await ParentService.getAll({
        page: parseInt(page) || 1,
        limit: parseInt(limit) || 20,
        search,
      });
      return ApiResponse.success(res, data, 'Parents fetched');
    } catch (error) {
      next(error);
    }
  }

  static async getById(req, res, next) {
    try {
      const parent = await ParentService.getById(req.params.id);
      return ApiResponse.success(res, parent, 'Parent details fetched');
    } catch (error) {
      next(error);
    }
  }

  static async linkStudent(req, res, next) {
    try {
      const { studentId } = req.body;
      const data = await ParentService.linkStudent(req.params.id, studentId);
      return ApiResponse.success(res, data, 'Student linked to parent');
    } catch (error) {
      next(error);
    }
  }

  /**
   * PATCH /api/parents/profile/me
   * Self-service profile update — parent edits their own record.
   */
  static async updateMyProfile(req, res, next) {
    try {
      const parent = await ParentService.updateMyProfile(req.user._id, req.body);
      return ApiResponse.success(res, parent, 'Profile updated successfully');
    } catch (error) {
      next(error);
    }
  }

  /**
   * PATCH /api/parents/:id
   * Admin partial update — photo, etc.
   */
  static async update(req, res, next) {
    try {
      const parent = await ParentService.update(req.params.id, req.body);
      return ApiResponse.success(res, parent, 'Parent updated successfully');
    } catch (error) {
      next(error);
    }
  }
}

module.exports = ParentController;
