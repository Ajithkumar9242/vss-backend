'use strict';

const RegistryService = require('./registryService');
const ApiResponse     = require('../../utils/apiResponse');

class InvoiceRegistryController {

  static async list(req, res, next) {
    try {
      const filters = { type: req.query.type, studentId: req.query.studentId, status: req.query.status, dateFrom: req.query.dateFrom, dateTo: req.query.dateTo, page: req.query.page, limit: req.query.limit };
      const result = await RegistryService.list(filters);
      return ApiResponse.success(res, result, 'Invoice registry fetched');
    } catch (e) { next(e); }
  }

  static async getDetail(req, res, next) {
    try {
      const result = await RegistryService.getDetail(req.params.id, req.query.type);
      return ApiResponse.success(res, result, 'Invoice detail fetched');
    } catch (e) { next(e); }
  }

  static async cancelInvoice(req, res, next) {
    try {
      const { cancelReason } = req.body;
      const type = req.query.type || req.body.type;
      const result = await RegistryService.cancelInvoice(req.params.id, type, cancelReason, req.user._id);
      return ApiResponse.success(res, result, 'Invoice cancelled');
    } catch (e) { next(e); }
  }

  static async getAuditLogs(req, res, next) {
    try {
      const type = req.query.type;
      const logs = await RegistryService.getAuditLogs(req.params.id, type);
      return ApiResponse.success(res, logs, 'Audit logs fetched');
    } catch (e) { next(e); }
  }
}

module.exports = InvoiceRegistryController;
