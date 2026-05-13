require('dotenv').config();
const mongoose = require('mongoose');

const FeeStructure = require('../models/FeeStructure');
const Admission = require('../models/Admission');
const Exam = require('../models/Exam');
const AcademicYear = require('../models/AcademicYear');

async function migrate() {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ DB connected');

    const years = await AcademicYear.find({});
    const yearMap = {};
    years.forEach(y => { yearMap[y.name] = y._id; });

    console.log('📌 AcademicYear map:', yearMap);

    // -------- FeeStructure --------
    const feeStructures = await FeeStructure.find({
        academicYear: { $exists: true },
    });

    for (const fs of feeStructures) {
        const yearId = yearMap[fs.academicYear];
        if (!yearId) {
            console.warn(`⚠️ Skipping FeeStructure ${fs._id} — year not found`);
            continue;
        }

        await FeeStructure.updateOne(
            { _id: fs._id },
            {
                $set: { academicYearId: yearId },
                $unset: { academicYear: "" },
            }
        );

        console.log(`✔ FeeStructure updated: ${fs._id}`);
    }

    // -------- Admission --------
    const admissions = await Admission.find({
        academicYear: { $exists: true },
    });

    for (const ad of admissions) {
        const yearId = yearMap[ad.academicYear];
        if (!yearId) continue;

        await Admission.updateOne(
            { _id: ad._id },
            {
                $set: { academicYearId: yearId },
                $unset: { academicYear: "" },
            }
        );
    }

    console.log(`✔ Admissions updated: ${admissions.length}`);

    // -------- Exam --------
    const exams = await Exam.find({
        academicYear: { $exists: true },
    });

    for (const ex of exams) {
        const yearId = yearMap[ex.academicYear];
        if (!yearId) continue;

        await Exam.updateOne(
            { _id: ex._id },
            {
                $set: { academicYearId: yearId },
                $unset: { academicYear: "" },
            }
        );
    }

    console.log(`✔ Exams updated: ${exams.length}`);

    // -------- SAFETY CHECK --------
    const remaining = await FeeStructure.countDocuments({
        academicYear: { $exists: true },
    });

    console.log(`🔍 Remaining old records: ${remaining}`);

    await mongoose.disconnect();
    console.log('✅ Migration complete');
}

migrate().catch(err => {
    console.error('❌ Migration failed:', err);
    process.exit(1);
});