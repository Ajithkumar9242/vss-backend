const path = require('path');

require('dotenv').config({
    path: path.resolve(__dirname, '../../.env')
});

const mongoose = require('mongoose');

console.log('ENV CHECK:', process.env.MONGO_URI);

async function clearDB() {
    if (!process.env.MONGO_URI) {
        throw new Error('MONGO_URI missing in .env');
    }

    await mongoose.connect(process.env.MONGO_URI);

    const collections = await mongoose.connection.db.collections();

    for (let collection of collections) {
        await collection.deleteMany({});
    }

    console.log('✅ Database cleared');
    process.exit();
}

clearDB();