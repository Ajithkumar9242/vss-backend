/**
 * penaltyEngine.js
 * Pure computational helpers for late fee / penalty amounts.
 */

function calculatePenalty({ dueDate, baseAmount, penaltyConfig, asOf }) {
  const result = { penaltyAmount: 0, periodsElapsed: 0, daysOverdue: 0, breakdown: '' };

  if (!penaltyConfig?.enabled) return result;
  if (!dueDate) return result;
  if (!baseAmount || baseAmount <= 0) return result;
  if (!penaltyConfig.value || penaltyConfig.value <= 0) return result;

  const now = asOf ? new Date(asOf) : new Date();
  const due = new Date(dueDate);
  if (Number.isNaN(due.getTime()) || now <= due) return result;

  const msElapsed = now.getTime() - due.getTime();
  const daysElapsed = Math.floor(msElapsed / (1000 * 60 * 60 * 24));
  result.daysOverdue = daysElapsed;

  const freq = penaltyConfig.frequency || 'monthly';
  let periods = 0;
  if (freq === 'daily') periods = daysElapsed;
  else if (freq === 'weekly') periods = Math.floor(daysElapsed / 7);
  else periods = Math.floor(daysElapsed / 30);

  result.periodsElapsed = periods;
  if (periods <= 0) return result;

  const perPeriod = penaltyConfig.type === 'percent'
    ? Math.round((baseAmount * penaltyConfig.value) / 100)
    : penaltyConfig.value;

  result.penaltyAmount = perPeriod * periods;
  result.breakdown = `Rs.${perPeriod} x ${periods} ${freq} period(s) = Rs.${result.penaltyAmount}`;
  return result;
}

function computeInvoicePenalty(invoice, feeProfile, asOf) {
  const summary = { totalPenalty: 0, daysOverdue: 0, details: [], breakdown: '' };
  if (!invoice || invoice.status === 'paid') return summary;

  const today = asOf ? new Date(asOf) : new Date();
  const installments = Array.isArray(invoice.installments) ? invoice.installments : [];

  installments.forEach((installment) => {
    const dueDate = installment.dueDate || null;
    const due = dueDate ? new Date(dueDate) : null;
    const balance = installment.balanceAmount != null
      ? installment.balanceAmount
      : Math.max(0, (installment.amount || 0) - (installment.paidAmount || 0));
    const status = String(installment.status || '').toUpperCase();
    const eligible = !!due && !Number.isNaN(due.getTime()) && today > due && balance > 0 && status !== 'PAID';

    console.log('[Penalty Check]', {
      installment,
      dueDate,
      today,
      balance,
      eligible,
    });

    if (!eligible || !invoice.penaltyConfig?.enabled) return;

    const result = calculatePenalty({
      dueDate,
      baseAmount: balance,
      penaltyConfig: invoice.penaltyConfig,
      asOf: today,
    });

    if (result.penaltyAmount > 0) {
      summary.totalPenalty += result.penaltyAmount;
      summary.daysOverdue = Math.max(summary.daysOverdue, result.daysOverdue);
      summary.details.push({
        source: 'installment',
        installmentNo: installment.installmentNo,
        label: installment.label,
        dueDate,
        balance,
        ...result,
      });
    }
  });

  summary.breakdown = summary.details.map((d) => d.breakdown).filter(Boolean).join('; ');
  return summary;
}

function isOverdue(dueDate, status) {
  if (!dueDate || String(status).toLowerCase() === 'paid') return false;
  return new Date() > new Date(dueDate);
}

function daysOverdue(dueDate, status) {
  if (!isOverdue(dueDate, status)) return 0;
  const ms = Date.now() - new Date(dueDate).getTime();
  return Math.floor(ms / (1000 * 60 * 60 * 24));
}

module.exports = { calculatePenalty, computeInvoicePenalty, isOverdue, daysOverdue };
