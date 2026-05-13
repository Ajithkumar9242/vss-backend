const HostelService = require('./service');
const ApiResponse = require('../../utils/apiResponse');

class HostelController {
  static async createRoom(req, res, next) {
    try {
      const room = await HostelService.createRoom(req.body);
      return ApiResponse.created(res, room, 'Room created');
    } catch (e) { next(e); }
  }

  static async getRooms(req, res, next) {
    try {
      const rooms = await HostelService.getRooms(req.query);
      return ApiResponse.success(res, rooms, 'Rooms fetched');
    } catch (e) { next(e); }
  }

  static async getRoomById(req, res, next) {
    try {
      const data = await HostelService.getRoomById(req.params.id);
      return ApiResponse.success(res, data, 'Room details fetched');
    } catch (e) { next(e); }
  }

  static async assignStudent(req, res, next) {
    try {
      const allocation = await HostelService.assignStudent(req.body);
      return ApiResponse.created(res, allocation, 'Student assigned to room');
    } catch (e) { next(e); }
  }

  static async removeStudent(req, res, next) {
    try {
      const result = await HostelService.removeStudent(req.params.studentId);
      return ApiResponse.success(res, result, 'Student removed from room');
    } catch (e) { next(e); }
  }

  static async getOccupancy(req, res, next) {
    try {
      const data = await HostelService.getOccupancy();
      return ApiResponse.success(res, data, 'Occupancy fetched');
    } catch (e) { next(e); }
  }
}

module.exports = HostelController;
