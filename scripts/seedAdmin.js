require('dotenv').config();
const bcrypt = require('bcrypt');
const connectDatabase = require('../config/database');
const User = require('../features/auth/user.model');
const { ROLES } = require('../config/constants');

const seedAdmin = async () => {
  await connectDatabase();

  const email = process.env.SEED_ADMIN_EMAIL || 'admin@elk-erp.com';
  const password = process.env.SEED_ADMIN_PASSWORD || 'Admin@12345';
  const name = process.env.SEED_ADMIN_NAME || 'System Administrator';

  const existingUser = await User.findOne({ email });

  if (existingUser) {
    console.log(`Admin user already exists: ${email}`);
    process.exit(0);
  }

  const hashedPassword = await bcrypt.hash(password, 12);

  await User.create({
    firstName: 'System',
    lastName: 'Administrator',
    name,
    email,
    password: hashedPassword,
    role: ROLES.ADMINISTRATOR,
  });

  console.log('Admin user created successfully');
  console.log(`Email: ${email}`);
  console.log(`Password: ${password}`);
  process.exit(0);
};

seedAdmin().catch((error) => {
  console.error('Seed failed:', error.message);
  process.exit(1);
});
