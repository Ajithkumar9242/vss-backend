const Material  = require('../../models/Material');
const AppError  = require('../../utils/AppError');
const mongoose  = require('mongoose');
const ActivityService = require('../activity/service');

class MaterialService {
  static async create(data, user) {
    const { title, description, type, fileUrl, fileName, mimeType, size, classId, subjectId, files } = data;
    if (!title)    throw new AppError('Title is required', 400);
    if (!type)     throw new AppError('type is required', 400);
    if (!classId)  throw new AppError('classId is required', 400);
    if (!subjectId)throw new AppError('subjectId is required', 400);
    // fileUrl OR files[] required (unless link type)
    if (!fileUrl && (!files || files.length === 0) && type !== 'link') {
      throw new AppError('fileUrl or files array is required', 400);
    }

    const doc = await Material.create({
      title: title.trim(),
      description: description?.trim() || '',
      type,
      fileUrl:  fileUrl || (files && files[0]?.url) || null,
      fileName: fileName || (files && files[0]?.name) || null,
      mimeType: mimeType || (files && files[0]?.type) || null,
      size:     size || (files && files[0]?.size) || 0,
      files:    files || [],
      classId,
      subjectId,
      uploadedBy: user._id,
    });

    ActivityService.log({
      action: `Study material uploaded: ${doc.title}`,
      module: 'material',
      performedBy: user._id,
      metadata: { materialId: doc._id, classId, subjectId, type },
    }).catch(() => {});

    return Material.findById(doc._id)
      .populate('classId',   'name code')
      .populate('subjectId', 'name code')
      .populate('uploadedBy','name')
      .lean();
  }

  static async getAll(filters = {}, user = null) {
    const query = { isActive: true };
    if (filters.classId   && mongoose.isValidObjectId(filters.classId))   query.classId   = filters.classId;
    if (filters.subjectId && mongoose.isValidObjectId(filters.subjectId)) query.subjectId = filters.subjectId;
    if (filters.type)     query.type = filters.type;

    // Faculty isolation: faculty can only see their own uploads
    if (user && user.role === 'faculty') {
      query.uploadedBy = user._id;
    }

    const page  = Math.max(1, parseInt(filters.page)  || 1);
    const limit = Math.min(100, parseInt(filters.limit) || 20);

    const [docs, total] = await Promise.all([
      Material.find(query)
        .populate('classId',   'name code')
        .populate('subjectId', 'name code')
        .populate('uploadedBy','name')
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit).limit(limit)
        .lean(),
      Material.countDocuments(query),
    ]);

    return { materials: docs, total, page, limit };
  }

  /**
   * Get all active materials for a specific classId.
   * Used by parent and student roles — no uploadedBy restriction.
   */
  static async getByClass(classId) {
    if (!mongoose.isValidObjectId(classId)) throw new AppError('Invalid classId', 400);
    const docs = await Material.find({ classId, isActive: true })
      .populate('subjectId', 'name code')
      .populate('uploadedBy', 'name')
      .sort({ createdAt: -1 })
      .lean();
    return { materials: docs, total: docs.length };
  }

  static async getById(id) {
    if (!mongoose.isValidObjectId(id)) throw new AppError('Invalid material ID', 400);
    const doc = await Material.findById(id)
      .populate('classId','name code').populate('subjectId','name code').populate('uploadedBy','name').lean();
    if (!doc) throw new AppError('Material not found', 404);
    return doc;
  }

  static async remove(id, user) {
    if (!mongoose.isValidObjectId(id)) throw new AppError('Invalid material ID', 400);
    const doc = await Material.findById(id);
    if (!doc) throw new AppError('Material not found', 404);
    if (user.role !== 'admin' && user.role !== 'super_admin' && String(doc.uploadedBy) !== String(user._id)) {
      throw new AppError('You can only delete your own materials', 403);
    }
    doc.isActive = false;
    await doc.save();
    return { deleted: true };
  }
}

module.exports = MaterialService;
