require('dotenv').config();
const mongoose = require('mongoose');

const SchoolSetting = require('../models/SchoolSetting');
const AcademicYear = require('../models/AcademicYear');
const Class = require('../models/Class');
const Section = require('../models/Section');
const Subject = require('../models/Subject');
const ClassConfig = require('../models/ClassConfig');
const FeeStructure = require('../models/FeeStructure');
const GradeConfig = require('../models/GradeConfig');
const AttendanceConfig = require('../models/AttendanceConfig');
const PaymentSetting = require('../models/PaymentSetting');
const Faculty = require('../models/Faculty');
const User = require('../models/User');

const AdmissionService = require('../modules/admission/service');
const SetupService = require('../modules/setup/service');

const run = async () => {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("🚀 Seeding started...");

    // ─────────────────────────────────────────────
    // 1. SCHOOL SETTINGS
    // ─────────────────────────────────────────────
    await SchoolSetting.create({
        name: "VMS International School",
        board: "CBSE",
        affiliationNumber: "CBSE-999999",
        principal: {
            name: "Dr. Rajesh Kumar",
            phone: "9876543210",
            email: "principal@vms.com"
        },
        contact: {
            phone: "9876543210",
            email: "info@vms.com",
            address: "Mumbai"
        }
    });

    // ─────────────────────────────────────────────
    // 2. ACADEMIC YEAR
    // ─────────────────────────────────────────────
    const year = await AcademicYear.create({
        name: "2026-27",
        startDate: new Date("2026-04-01"),
        endDate: new Date("2027-03-31"),
        isActive: true
    });

    // ─────────────────────────────────────────────
    // 3. CLASSES
    // ─────────────────────────────────────────────
    const classes = await Class.insertMany([
        { name: "LKG", code: "LKG" },
        { name: "UKG", code: "UKG" },
        { name: "Class 1", code: "CLS1" },
        { name: "Class 2", code: "CLS2" }
    ]);

    const class1 = classes[2];

    // ─────────────────────────────────────────────
    // 4. SECTIONS
    // ─────────────────────────────────────────────
    const sections = await Section.insertMany([
        { name: "A", classId: class1._id },
        { name: "B", classId: class1._id }
    ]);

    const sectionA = sections[0];

    // ─────────────────────────────────────────────
    // 5. SUBJECTS
    // ─────────────────────────────────────────────
    const subjects = await Subject.insertMany([
        { name: "Mathematics", code: "MATH" },
        { name: "English", code: "ENG" },
        { name: "Science", code: "SCI" }
    ]);

    // ─────────────────────────────────────────────
    // 6. CLASS CONFIG
    // ─────────────────────────────────────────────
    await ClassConfig.create({
        classId: class1._id,
        academicYearId: year._id,
        subjects: subjects.map(s => s._id)
    });

    // ─────────────────────────────────────────────
    // 7. GRADE CONFIG
    // ─────────────────────────────────────────────
    await GradeConfig.insertMany([
        { min: 90, max: 100, grade: "A+" },
        { min: 75, max: 89, grade: "A" },
        { min: 60, max: 74, grade: "B" },
        { min: 50, max: 59, grade: "C" },
        { min: 35, max: 49, grade: "D" },
        { min: 0, max: 34, grade: "F" }
    ]);

    // ─────────────────────────────────────────────
    // 8. ATTENDANCE CONFIG
    // ─────────────────────────────────────────────
    await AttendanceConfig.create({
        academicYearId: year._id,
        sessions: ["Morning", "Afternoon"]
    });

    // ─────────────────────────────────────────────
    // 9. PAYMENT SETTINGS
    // ─────────────────────────────────────────────
    await PaymentSetting.create({
        razorpayKeyId: "rzp_test_demo",
        qrCodeUrl: "https://dummy-qr.com",
        allowManual: true
    });

    // ─────────────────────────────────────────────
    // 10. FEE STRUCTURE (IMPORTANT)
    // ─────────────────────────────────────────────
    const feeStructure = await FeeStructure.create({
        classId: class1._id,
        academicYearId: year._id,
        totalAmount: 50000,
        installments: [
            { name: "Term 1", amount: 25000, dueDate: new Date("2026-06-01") },
            { name: "Term 2", amount: 25000, dueDate: new Date("2026-12-01") }
        ]
    });

    // ─────────────────────────────────────────────
    // 11. FACULTY + USER
    // ─────────────────────────────────────────────
    const facultyUser = await User.create({
        name: "John Teacher",
        email: "faculty@vms.com",
        password: "Vms@1234",
        role: "faculty"
    });

    await Faculty.create({
        name: "John Teacher",
        email: "faculty@vms.com",
        userId: facultyUser._id,
        assignedClasses: [class1._id]
    });

    // ─────────────────────────────────────────────
    // 12. ADMISSION → APPROVE → STUDENT + INVOICE
    // ─────────────────────────────────────────────
    const admission = await AdmissionService.createAdmission({
        studentName: "Aarav Sharma",
        gender: "male",
        dateOfBirth: "2018-05-10",
        classId: class1._id,
        sectionId: sectionA._id,
        parentName: "Rohit Sharma",
        parentPhone: "8888888888",
        parentEmail: "parent@vms.com",
        address: "Mumbai"
    });

    await AdmissionService.approveAdmission(admission._id, facultyUser._id);

    console.log("✅ SEED COMPLETE");
    console.log("👨‍🏫 Faculty Login → faculty@vms.com / Vms@1234");
    console.log("👨‍👩‍👦 Parent Login → parent@vms.com / Vms@1234");

    process.exit();
};

run().catch(err => {
    console.error(err);
    process.exit(1);
});