/**
 * penaltyEngine.js
 * Pure function: calculates late fee / penalty amount based on how many
 * time periods have elapsed since the invoice due date.
 *
 * No DB writes — purely computational, called during invoice fetch.
 */

/**
 * Calculate penalty for a given invoice.
 *
 * @param {Object} params
 * @param {Date|string} params.dueDate        - invoice or installment due date
 * @param {number}      params.baseAmount     - amount on which penalty applies (dueAmount or component amount)
 * @param {Object}      params.penaltyConfig  - { enabled, type:'fixed'|'percent', value, frequency:'daily'|'weekly'|'monthly' }
 * @param {Date}        [params.asOf]         - calculation date (defaults to now)
 * @returns {{ penaltyAmount: number, periodsElapsed: number, daysOverdue: number, breakdown: string }}
 */
function calculatePenalty({ dueDate, baseAmount, penaltyConfig, asOf }) {
  const result = { penaltyAmount: 0, periodsElapsed: 0, daysOverdue: 0, breakdown: '' };

  if (!penaltyConfig?.enabled) return result;
  if (!dueDate) return result;
  if (!baseAmount || baseAmount <= 0) return result;
  if (!penaltyConfig.value || penaltyConfig.value <= 0) return result;

  const now = asOf ? new Date(asOf) : new Date();
  const due = new Date(dueDate);

  if (now <= due) return result; // not yet overdue

  const msElapsed = now.getTime() - due.getTime();
  const daysElapsed = Math.floor(msElapsed / (1000 * 60 * 60 * 24));
  result.daysOverdue = daysElapsed;

  let periods = 0;
  const freq = penaltyConfig.frequency || 'monthly';

  if (freq === 'daily') {
    periods = daysElapsed; // 1 period per day
  } else if (freq === 'weekly') {
    periods = Math.floor(daysElapsed / 7);
  } else {
    // monthly (default)
    periods = Math.floor(daysElapsed / 30);
  }

  result.periodsElapsed = periods;
  if (periods <= 0) return result;

  let perPeriod = 0;
  if (penaltyConfig.type === 'percent') {
    perPeriod = Math.round((baseAmount * penaltyConfig.value) / 100);
  } else {
    perPeriod = penaltyConfig.value;
  }

  result.penaltyAmount = perPeriod * periods;
  result.breakdown = `₹${perPeriod} × ${periods} ${freq} period(s) = ₹${result.penaltyAmount}`;

  return result;
}

/**
 * Calculate total auto penalty for an invoice considering:
 * - Invoice-level penaltyConfig (if set on the invoice itself)
 * - Per-component lateFeeConfig from the student's fee profile
 *
 * Returns the total computed penalty amount (not saved to DB).
 *
 * @param {Object} invoice       - FeeInvoice document (plain object)
 * @param {Object} [feeProfile]  - StudentFeeProfile with populated selectedComponents
 * @param {Date}   [asOf]        - calculation reference date
 * @returns {{ totalPenalty: number, daysOverdue: number, details: Array }}
 */
function computeInvoicePenalty(invoice, feeProfile, asOf) {
  const summary = { totalPenalty: 0, daysOverdue: 0, details: [] };

  if (!invoice || invoice.status === 'paid') return summary;

  const now = asOf ? new Date(asOf) : new Date();

  // ── Due date resolution (priority order) ─────────────────────────
  // 1. invoice.nextDueDate (set by recordInstallmentPayment / generateInvoice)
  // 2. earliest unpaid installment with a dueDate
  // 3. invoice.dueDate (legacy fallback — field was removed but may still exist on old docs)
  let due = invoice.nextDueDate ? new Date(invoice.nextDueDate) : null;

  if (!due && invoice.installments && invoice.installments.length > 0) {
    const unpaidInsts = invoice.installments
      .filter(i => i.dueDate && (i.amount > (i.paidAmount || 0)))
      .sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));
    if (unpaidInsts.length > 0) {
      due = new Date(unpaidInsts[0].dueDate);
    }
  }

  if (!due && invoice.dueDate) {
    due = new Date(invoice.dueDate); // legacy fallback
  }

  if (due && now > due) {
    const msElapsed = now.getTime() - due.getTime();
    summary.daysOverdue = Math.floor(msElapsed / (1000 * 60 * 60 * 24));
  }

  // ── 1. Invoice-level penalty config ──────────────────────────
  if (invoice.penaltyConfig?.enabled && due) {
    const result = calculatePenalty({
      dueDate: due,
      baseAmount: invoice.dueAmount || invoice.totalAmount,
      penaltyConfig: invoice.penaltyConfig,
      asOf: now,
    });
    summary.totalPenalty += result.penaltyAmount;
    summary.daysOverdue = Math.max(summary.daysOverdue, result.daysOverdue);
    if (result.penaltyAmount > 0) {
      summary.details.push({ source: 'invoice', ...result });
    }
  }



  return summary;
}

/**
 * Determine if an invoice/installment is overdue.
 */
function isOverdue(dueDate, status) {
  if (!dueDate || status === 'paid') return false;
  return new Date() > new Date(dueDate);
}

/**
 * Days overdue (0 if not overdue).
 */
function daysOverdue(dueDate, status) {
  if (!isOverdue(dueDate, status)) return 0;
  const ms = Date.now() - new Date(dueDate).getTime();
  return Math.floor(ms / (1000 * 60 * 60 * 24));
}

module.exports = { calculatePenalty, computeInvoicePenalty, isOverdue, daysOverdue };
