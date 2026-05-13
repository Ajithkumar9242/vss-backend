const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const User = require('../models/User');
const Class = require('../models/Class');
const Subject = require('../models/Subject');
const Section = require('../models/Section');

const seedData = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB for seeding');

    // ── Seed Admin User ──────────────────────────────────────
    const existingAdmin = await User.findOne({ email: 'admin@vms.com' });
    if (!existingAdmin) {
      await User.create({
        name: 'Super Admin',
        email: 'admin@vms.com',
        password: 'Admin@123',
        role: 'super_admin',
        phone: '9999999999',
      });
      console.log('✅ Admin user seeded: admin@vms.com / Admin@123');
    } else {
      console.log('ℹ️  Admin user already exists');
    }

    // ── Seed Classes ─────────────────────────────────────────
    const classCount = await Class.countDocuments();
    if (classCount === 0) {
      const classes = [];
      for (let i = 1; i <= 12; i++) {
        classes.push({
          name: `Class ${i}`,
          code: `CLS${i}`,
          description: `Standard ${i}`,
          order: i,
        });
      }
      const createdClasses = await Class.insertMany(classes);
      console.log(`✅ ${createdClasses.length} classes seeded`);

      // ── Seed Sections for each class ──────────────────────
      const sections = [];
      for (const cls of createdClasses) {
        ['A', 'B', 'C'].forEach((sec) => {
          sections.push({
            name: sec,
            classId: cls._id,
            capacity: 40,
          });
        });
      }
      await Section.insertMany(sections);
      console.log(`✅ ${sections.length} sections seeded`);
    } else {
      console.log('ℹ️  Classes already exist');
    }

    // ── Seed Subjects ────────────────────────────────────────
    const subjectCount = await Subject.countDocuments();
    if (subjectCount === 0) {
      const subjects = [
        { name: 'Mathematics', code: 'MATH', type: 'theory' },
        { name: 'English', code: 'ENG', type: 'theory' },
        { name: 'Science', code: 'SCI', type: 'theory' },
        { name: 'Social Studies', code: 'SST', type: 'theory' },
        { name: 'Hindi', code: 'HIN', type: 'theory' },
        { name: 'Computer Science', code: 'CS', type: 'practical' },
        { name: 'Physical Education', code: 'PE', type: 'practical' },
        { name: 'Art & Craft', code: 'ART', type: 'elective' },
      ];
      await Subject.insertMany(subjects);
      console.log(`✅ ${subjects.length} subjects seeded`);
    } else {
      console.log('ℹ️  Subjects already exist');
    }

    console.log('\n🎉 Seeding complete!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Seeding failed:', error.message);
    process.exit(1);
  }
};

seedData();
