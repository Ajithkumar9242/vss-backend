'use strict';

const PosService    = require('./service');
const ApiResponse   = require('../../utils/apiResponse');
const SchoolSetting = require('../../models/SchoolSetting');
const { generatePosInvoicePdf } = require('../../utils/pdf/posInvoicePdf');

class PosController {

  // ── Catalog ──────────────────────────────────────────────

  static async listCatalog(req, res, next) {
    try {
      const items = await PosService.listCatalog();
      return ApiResponse.success(res, items, 'POS catalog fetched');
    } catch (e) { next(e); }
  }

  static async createItem(req, res, next) {
    try {
      const item = await PosService.createItem(req.body, req.user._id);
      return ApiResponse.created(res, item, 'POS item created');
    } catch (e) { next(e); }
  }

  static async updateItem(req, res, next) {
    try {
      const item = await PosService.updateItem(req.params.id, req.body);
      return ApiResponse.success(res, item, 'POS item updated');
    } catch (e) { next(e); }
  }

  static async toggleItem(req, res, next) {
    try {
      const item = await PosService.toggleItem(req.params.id);
      return ApiResponse.success(res, item, `Item ${item.active ? 'activated' : 'deactivated'}`);
    } catch (e) { next(e); }
  }

  // ── Invoices ─────────────────────────────────────────────

  static async createInvoice(req, res, next) {
    try {
      const { studentId, items, paymentMode, discountTotal, taxTotal, notes, paymentRef } = req.body;
      const invoice = await PosService.createInvoice({ studentId, items, paymentMode, discountTotal, taxTotal, notes, paymentRef, userId: req.user._id });
      return ApiResponse.created(res, invoice, 'Invoice created');
    } catch (e) { next(e); }
  }

  static async listInvoices(req, res, next) {
    try {
      const filters = { studentId: req.query.studentId, status: req.query.status, dateFrom: req.query.dateFrom, dateTo: req.query.dateTo };
      const invoices = await PosService.listInvoices(filters);
      return ApiResponse.success(res, invoices, 'Invoices fetched');
    } catch (e) { next(e); }
  }

  static async getInvoice(req, res, next) {
    try {
      const invoice = await PosService.getInvoice(req.params.id);
      return ApiResponse.success(res, invoice, 'Invoice fetched');
    } catch (e) { next(e); }
  }

  static async cancelInvoice(req, res, next) {
    try {
      const result = await PosService.cancelInvoice({ id: req.params.id, cancelReason: req.body.cancelReason, userId: req.user._id });
      return ApiResponse.success(res, result, 'Invoice cancelled');
    } catch (e) { next(e); }
  }

  static async getInvoicePdf(req, res, next) {
    try {
      const invoice = await PosService.getInvoice(req.params.id);
      const school  = await SchoolSetting.findOne().lean();
      const buffer  = await generatePosInvoicePdf(invoice, school);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename="invoice-${invoice.invoiceNumber}.pdf"`);
      res.send(buffer);
    } catch (e) { next(e); }
  }
}

module.exports = PosController;
