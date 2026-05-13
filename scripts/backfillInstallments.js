/**
 * BACKFILL INSTALLMENTS SCRIPT
 * 
 * This script addresses the missing bridge between FeeStructure.installments
 * and FeeInvoice.installments. It finds all existing invoices that have 
 * empty installment arrays, fetches their linked FeeStructure, and populates
 * the invoice.installments array.
 * 
 * It also handles copying any `paidAmount` that might have been recorded
 * in the old manual flow on the FeeStructure itself.
 * 
 * Usage: node backend/scripts/backfillInstallments.js
 */

const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const FeeInvoice = require('../src/models/FeeInvoice');
const FeeStructure = require('../src/models/FeeStructure');

async function connectDB() {
  const mongoURI = process.env.MONGODB_URI;
  if (!mongoURI) {
    console.error('MONGODB_URI is not set in environment variables');
    process.exit(1);
  }
  await mongoose.connect(mongoURI);
  console.log('Connected to MongoDB');
}

/**
 * Compute the next upcoming unpaid installment dueDate from an installments array.
 */
function _computeNextDueDate(installments) {
  if (!Array.isArray(installments) || !installments.length) return null;
  const now = new Date();
  const upcoming = installments
    .filter(i => i.status !== 'paid' && i.dueDate && new Date(i.dueDate) >= now)
    .sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));
  return upcoming[0]?.dueDate || null;
}

async function run() {
  try {
    await connectDB();

    console.log('--- Starting FeeInvoice Installment Backfill ---');

    // Find all invoices that have 0 installments
    const invoices = await FeeInvoice.find({
      $or: [
        { installments: { $exists: false } },
        { installments: { $size: 0 } }
      ]
    });

    console.log(`Found ${invoices.length} invoices to backfill.`);

    let successCount = 0;
    let failCount = 0;
    let noStructureCount = 0;

    for (const invoice of invoices) {
      try {
        let structureId = invoice.feeStructureId;

        // Try resolving structure by classId + academicYearId if missing
        if (!structureId && invoice.classId && invoice.academicYearId) {
          const struct = await FeeStructure.findOne({
            classId: invoice.classId,
            academicYearId: invoice.academicYearId
          }).sort({ createdAt: -1 });

          if (struct) {
            structureId = struct._id;
            invoice.feeStructureId = structureId;
          }
        }

        if (!structureId) {
          console.warn(`[SKIP] Invoice ${invoice._id}: No FeeStructure linked and could not resolve.`);
          noStructureCount++;
          continue;
        }

        const structure = await FeeStructure.findById(structureId);
        if (!structure) {
          console.warn(`[SKIP] Invoice ${invoice._id}: Linked FeeStructure not found in DB.`);
          noStructureCount++;
          continue;
        }

        if (!structure.installments || structure.installments.length === 0) {
          console.warn(`[SKIP] Invoice ${invoice._id}: FeeStructure has no installments to backfill.`);
          noStructureCount++;
          continue;
        }

        // Bridge the installments
        const now = new Date();
        const scheduleInstallments = structure.installments.map((inst, i) => ({
          installmentNo: i + 1,
          label: inst.name,
          amount: inst.amount,
          dueDate: inst.dueDate || null,
          paidAmount: inst.paidAmount || 0, // IMPORTANT: copies over existing manual payments
          status: (inst.paidAmount >= inst.amount) ? 'paid'
            : (inst.paidAmount > 0) ? 'partial'
              : (inst.dueDate && new Date(inst.dueDate) < now) ? 'overdue'
                : 'pending',
        }));

        // Compute due dates
        const dueDates = scheduleInstallments
          .filter(i => i.dueDate)
          .map(i => new Date(i.dueDate))
          .sort((a, b) => a - b);
        const dueDate = dueDates[0] || null;
        const nextDueDate = _computeNextDueDate(scheduleInstallments);

        // Update the invoice
        invoice.installments = scheduleInstallments;
        invoice.dueDate = invoice.dueDate || dueDate;
        invoice.nextDueDate = nextDueDate;

        // Note: we do NOT touch dueAmount or paidAmount here. We trust the invoice
        // totals as the source of truth for overall balance. This backfill only
        // populates the schedule details.

        await invoice.save();
        successCount++;

        if (successCount % 50 === 0) {
          console.log(`Processed ${successCount} invoices...`);
        }

      } catch (err) {
        console.error(`[ERROR] Failed to process invoice ${invoice._id}:`, err.message);
        failCount++;
      }
    }

    console.log('--- Backfill Complete ---');
    console.log(`Total processed:  ${invoices.length}`);
    console.log(`Success:          ${successCount}`);
    console.log(`No structure:     ${noStructureCount}`);
    console.log(`Failed:           ${failCount}`);

  } catch (error) {
    console.error('Fatal error running backfill:', error);
  } finally {
    mongoose.disconnect();
  }
}

run();
