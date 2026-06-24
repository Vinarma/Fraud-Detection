// backend/src/config/db.js
const mongoose = require('mongoose');
 
const connectDB = async () => {
  try {
    console.log('🔗 Attempting to connect to MongoDB...');
    
    const conn = await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      dbName: process.env.DB_NAME || 'fraudtracker_db',
      serverSelectionTimeoutMS: 5000,
      retryWrites: true,
      w: 'majority'
    });
 
    console.log(`✅ MongoDB Connected Successfully!`);
    console.log(`   Host: ${conn.connection.host}`);
    console.log(`   Database: ${conn.connection.name}`);
    
    // Log connection events
    mongoose.connection.on('connected', () => {
      console.log('📊 Mongoose connected to MongoDB');
    });
 
    mongoose.connection.on('error', (err) => {
      console.error('❌ Mongoose connection error:', err);
    });
 
    mongoose.connection.on('disconnected', () => {
      console.log('⚠️  Mongoose disconnected from MongoDB');
    });
 
    return conn;
  } catch (error) {
    console.error('❌ MongoDB Connection Error:', {
      message: error.message,
      code: error.code,
      hint: 'Check your MONGODB_URI in .env file'
    });
    process.exit(1);
  }
};
 
module.exports = connectDB;