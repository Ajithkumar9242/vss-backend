require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');

async function run() {
    const uri =
        process.env.MONGO_URI ||
        process.env.MONGODB_URI ||
        process.env.DATABASE_URL ||
        process.env.MONGO_URL;

    if (!uri) {
        console.error('❌ Mongo URI missing. Set MONGO_URI (or MONGODB_URI / DATABASE_URL) in .env');
        process.exit(1);
    }

    await mongoose.connect(uri);

    const users = [
        {
            name: 'Test Accountant',
            email: 'accountant@vss.com',
            password: 'Vms@1234',
            role: 'accountant',
            phone: '9000000001',
            isActive: true,
        },
        {
            name: 'Test Principal',
            email: 'principal@vss.com',
            password: 'Vms@1234',
            role: 'principal',
            phone: '9000000002',
            isActive: true,
        },
    ];

    for (const u of users) {
        const exists = await User.findOne({ email: u.email });
        if (!exists) {
            await User.create(u); // will hash password if your User schema has pre('save')
            console.log('Created:', u.email);
        } else {
            console.log('Already exists:', u.email);
        }
    }

    process.exit(0);
}

run().catch((e) => {
    console.error(e);
    process.exit(1);
});