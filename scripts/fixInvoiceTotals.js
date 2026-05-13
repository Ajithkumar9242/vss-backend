const mongoose = require('mongoose');
require('dotenv').config();

const FeeInvoice = require('../src/models/FeeInvoice');
const StudentFeeProfile = require('../src/models/StudentFeeProfile');

async function run() {
    await mongoose.connect(process.env.MONGODB_URI);

    const invoices = await FeeInvoice.find();

    for (const invoice of invoices) {
        const profile = await StudentFeeProfile.findById(invoice.feeProfileId);

        if (!profile) continue;

        const totalAmount = profile.grossFee || 0;
        const discountAmount = profile.discountAmt || 0;

        // KEEP existing actual payments
        const paidAmount = invoice.paidAmount || 0;

        const dueAmount = Math.max(
            0,
            totalAmount - discountAmount - paidAmount
        );

        invoice.totalAmount = totalAmount;
        invoice.discountAmount = discountAmount;
        invoice.dueAmount = dueAmount;

        await invoice.save();

        console.log(`Fixed invoice ${invoice.invoiceNumber}`);
    }

    console.log('DONE');
    process.exit(0);
}

run().catch(err => {
    console.error(err);
    process.exit(1);
});