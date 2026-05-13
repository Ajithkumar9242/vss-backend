const FeeInvoice  = require('../../models/FeeInvoice');
const FeePayment  = require('../../models/FeePayment');
const Student     = require('../../models/Student');
const FeeComponent = require('../../models/FeeComponent');
const StudentFeeProfile = require('../../models/StudentFeeProfile');
const mongoose    = require('mongoose');

/**
 * FeeAnalyticsService — dashboard aggregations and reporting.
 */
class FeeAnalyticsService {

  /**
   * Dashboard summary cards.
   * Returns: totalCollection, pendingDues, overdueCount, penaltiesCollected, discountsGranted
   */
  static async getDashboardStats(filters = {}) {
    const matchStage = {};
    if (filters.classId && mongoose.isValidObjectId(filters.classId)) {
      matchStage.classId = new mongoose.Types.ObjectId(filters.classId);
    }
    if (filters.academicYearId && mongoose.isValidObjectId(filters.academicYearId)) {
      matchStage.academicYearId = new mongoose.Types.ObjectId(filters.academicYearId);
    }

    const [agg] = await FeeInvoice.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: null,
          totalExpected:   { $sum: { $ifNull: ['$netFee', '$totalAmount'] } },
          totalCollected:  { $sum: '$paidAmount' },
          totalDue:        { $sum: '$dueAmount' },
          totalPenalty:    { $sum: '$penaltyAmount' },
          totalDiscount:   { $sum: '$discountAmount' },
          totalInvoices:   { $sum: 1 },
          paidCount:       { $sum: { $cond: [{ $eq: ['$status', 'paid'] }, 1, 0] } },
          partialCount:    { $sum: { $cond: [{ $eq: ['$status', 'partial'] }, 1, 0] } },
          unpaidCount:     { $sum: { $cond: [{ $eq: ['$status', 'unpaid'] }, 1, 0] } },
          overdueCount:    { $sum: { $cond: [{ $eq: ['$status', 'overdue'] }, 1, 0] } },
        },
      },
    ]);

    return {
      totalExpected:  agg?.totalExpected  || 0,
      totalCollected: agg?.totalCollected || 0,
      totalDue:       agg?.totalDue       || 0,
      totalPenalty:   agg?.totalPenalty   || 0,
      totalDiscount:  agg?.totalDiscount  || 0,
      totalInvoices:  agg?.totalInvoices  || 0,
      paidCount:      agg?.paidCount      || 0,
      partialCount:   agg?.partialCount   || 0,
      unpaidCount:    agg?.unpaidCount    || 0,
      overdueCount:   agg?.overdueCount   || 0,
    };
  }

  /**
   * Monthly collection data for the current or specified year.
   * Returns array of { month, collected, expected } for chart.
   */
  static async getMonthlyCollection(year) {
    const targetYear = year || new Date().getFullYear();
    const startDate  = new Date(`${targetYear}-01-01T00:00:00.000Z`);
    const endDate    = new Date(`${targetYear + 1}-01-01T00:00:00.000Z`);

    let payments = [];
    try {
      payments = await FeePayment.aggregate([
        {
          $match: {
            // Accept both 'approved' (manual) and 'completed' (installment) payments
            status: { $in: ['approved', 'completed'] },
            paidAt: { $gte: startDate, $lt: endDate },
          },
        },
        {
          $group: {
            _id:   { $month: '$paidAt' },
            total: { $sum: '$amount' },
            count: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
      ]);
    } catch (aggErr) {
      console.error('[Analytics] getMonthlyCollection aggregation failed:', aggErr.message);
      // Return zeroed-out months rather than propagating to 503
    }

    const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return monthNames.map((month, idx) => {
      const found = payments.find(p => p._id === idx + 1);
      return {
        month,
        monthNum: idx + 1,
        collected: found?.total || 0,
        count:     found?.count || 0,
      };
    });
  }

  /**
   * Class-wise fee collection breakdown.
   */
  static async getClasswiseDues(academicYearId) {
    const matchStage = {};
    if (academicYearId && mongoose.isValidObjectId(academicYearId)) {
      matchStage.academicYearId = new mongoose.Types.ObjectId(academicYearId);
    }

    let result = [];
    try {
      result = await FeeInvoice.aggregate([
        { $match: matchStage },
        {
          $group: {
            _id:       '$classId',
            expected:  { $sum: '$totalAmount' },
            collected: { $sum: '$paidAmount' },
            due:       { $sum: '$dueAmount' },
            count:     { $sum: 1 },
          },
        },
        {
          $lookup: {
            from:         'classes',
            localField:   '_id',
            foreignField: '_id',
            as:           'classInfo',
          },
        },
        // Use array index access instead of $unwind to avoid MongoServerError
        // on versions that reject preserveNullAndEmpty in certain contexts.
        {
          $project: {
            className:  { $ifNull: [{ $arrayElemAt: ['$classInfo.name', 0] }, 'Unknown'] },
            expected:   1,
            collected:  1,
            due:        1,
            count:      1,
          },
        },
        { $sort: { className: 1 } },
      ]);
    } catch (aggErr) {
      console.error('[Analytics] getClasswiseDues aggregation failed:', aggErr.message);
      // Return empty array rather than propagating to 503
    }

    return result;
  }

  /**
   * Fee component-wise collection summary.
   */
  static async getComponentSummary(academicYearId) {
    const matchStage = { active: true };
    const components = await FeeComponent.find(matchStage).lean();

    // Count how many student profiles have each component
    const profilePipeline = [];
    if (academicYearId && mongoose.isValidObjectId(academicYearId)) {
      profilePipeline.push({ $match: { academicYearId: new mongoose.Types.ObjectId(academicYearId) } });
    }
    profilePipeline.push(
      { $unwind: '$selectedComponents' },
      {
        $group: {
          _id:   '$selectedComponents.componentId',
          count: { $sum: 1 },
          total: { $sum: '$selectedComponents.amount' },
        },
      }
    );

    const profileAgg = await StudentFeeProfile.aggregate(profilePipeline);
    const profileMap = {};
    for (const p of profileAgg) {
      profileMap[p._id?.toString()] = { count: p.count, total: p.total };
    }

    return components.map(comp => ({
      _id:       comp._id,
      name:      comp.name,
      code:      comp.code,
      amount:    comp.amount,
      mandatory: comp.mandatory,
      studentsCount: profileMap[comp._id.toString()]?.count || 0,
      totalExpected: profileMap[comp._id.toString()]?.total || 0,
    }));
  }
  /**
   * Students with overdue installments.
   */
  static async getOverdueStudents(filters = {}) {
    const matchStage = { status: { $in: ['overdue', 'partial', 'unpaid'] } };
    if (filters.classId && mongoose.isValidObjectId(filters.classId)) {
      matchStage.classId = new mongoose.Types.ObjectId(filters.classId);
    }

    const invoices = await FeeInvoice.find(matchStage)
      .populate('studentId', 'name rollNo')
      .populate('classId', 'name')
      .lean();

    const now = new Date();
    return invoices
      .filter(inv => inv.nextDueDate && new Date(inv.nextDueDate) < now)
      .map(inv => ({
        invoiceId:    inv._id,
        invoiceNumber: inv.invoiceNumber,
        student:      inv.studentId,
        class:        inv.classId,
        dueAmount:    inv.dueAmount,
        nextDueDate:  inv.nextDueDate,
        daysOverdue:  Math.floor((now - new Date(inv.nextDueDate)) / (1000 * 60 * 60 * 24)),
        status:       inv.status,
      }));
  }
}

module.exports = FeeAnalyticsService;

