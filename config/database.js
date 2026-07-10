const mongoose = require('mongoose');
const env = require('./env');

const connectDatabase = async () => {
  await mongoose.connect(env.mongodbUri);
  console.log('MongoDB connected');
};

module.exports = connectDatabase;
