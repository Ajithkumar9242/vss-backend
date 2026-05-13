const Room = require('../../models/Room');
const RoomAllocation = require('../../models/RoomAllocation');
const Student = require('../../models/Student');
const AppError = require('../../utils/AppError');
const mongoose = require('mongoose');
const NotificationService = require('../notification/service');
const ActivityService = require('../activity/service');

class HostelService {
  // ─── ROOMS ─────────────────────────────────────────────────
  static async createRoom(data) {
    const existing = await Room.findOne({ roomNumber: data.roomNumber });
    if (existing) throw new AppError('Room number already exists', 400);
    return Room.create(data);
  }

  static async getRooms(filters = {}) {
    const query = { isActive: true };
    if (filters.type) query.type = filters.type;
    return Room.find(query).sort({ roomNumber: 1 }).lean();
  }

  static async getRoomById(roomId) {
    if (!mongoose.isValidObjectId(roomId)) throw new AppError('Invalid room ID', 400);
    const room = await Room.findById(roomId);
    if (!room) throw new AppError('Room not found', 404);

    const allocations = await RoomAllocation.find({ roomId, isActive: true })
      .populate('studentId', 'name rollNo classId')
      .sort({ bedNumber: 1 })
      .lean();

    return { room, allocations };
  }

  // ─── ALLOCATIONS ───────────────────────────────────────────
  static async assignStudent({ studentId, roomId, bedNumber }) {
    if (!mongoose.isValidObjectId(studentId)) throw new AppError('Invalid student ID', 400);
    if (!mongoose.isValidObjectId(roomId)) throw new AppError('Invalid room ID', 400);

    const student = await Student.findById(studentId);
    if (!student) throw new AppError('Student not found', 404);

    const room = await Room.findById(roomId);
    if (!room) throw new AppError('Room not found', 404);

    if (room.occupiedBeds >= room.capacity) {
      throw new AppError('Room is at full capacity', 400);
    }

    if (bedNumber > room.capacity || bedNumber < 1) {
      throw new AppError(`Bed number must be between 1 and ${room.capacity}`, 400);
    }

    // Check if student already has an active allocation
    const existingAlloc = await RoomAllocation.findOne({ studentId, isActive: true });
    if (existingAlloc) {
      throw new AppError('Student is already allocated to a room. Remove first.', 400);
    }

    const allocation = await RoomAllocation.create({ studentId, roomId, bedNumber });

    // Update room occupancy
    room.occupiedBeds = await RoomAllocation.countDocuments({ roomId, isActive: true });
    await room.save();

    // Non-blocking: activity + notification
    ActivityService.log({
      studentId, action: `Assigned to Room ${room.roomNumber}, Bed ${bedNumber}`,
      module: 'hostel', metadata: { roomNumber: room.roomNumber, bedNumber },
    }).catch(() => {});

    if (student.parentId) {
      const Parent = require('../../models/Parent');
      Parent.findById(student.parentId).then(p => {
        if (p?.userId) NotificationService.create(p.userId, {
          title: 'Hostel Allocation',
          message: `${student.name} assigned to Room ${room.roomNumber}, Bed ${bedNumber}`,
          type: 'info', metadata: { studentId, roomId },
        });
      }).catch(() => {});
    }

    return allocation.populate([
      { path: 'studentId', select: 'name rollNo' },
      { path: 'roomId', select: 'roomNumber type' },
    ]);
  }

  static async removeStudent(studentId) {
    if (!mongoose.isValidObjectId(studentId)) throw new AppError('Invalid student ID', 400);

    const allocation = await RoomAllocation.findOne({ studentId, isActive: true });
    if (!allocation) throw new AppError('No active allocation found for this student', 404);

    allocation.isActive = false;
    allocation.endDate = new Date();
    await allocation.save();

    // Update room occupancy
    const room = await Room.findById(allocation.roomId);
    if (room) {
      room.occupiedBeds = await RoomAllocation.countDocuments({ roomId: room._id, isActive: true });
      await room.save();
    }

    return allocation;
  }

  static async getOccupancy() {
    const rooms = await Room.find({ isActive: true }).sort({ roomNumber: 1 }).lean();
    const allocations = await RoomAllocation.find({ isActive: true })
      .populate('studentId', 'name rollNo')
      .lean();

    const allocMap = {};
    for (const a of allocations) {
      const key = a.roomId.toString();
      if (!allocMap[key]) allocMap[key] = [];
      allocMap[key].push(a);
    }

    return rooms.map(r => ({
      ...r,
      allocations: allocMap[r._id.toString()] || [],
    }));
  }
}

module.exports = HostelService;
