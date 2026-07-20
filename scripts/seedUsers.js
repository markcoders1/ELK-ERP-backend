require('dotenv').config();
const bcrypt = require('bcrypt');
const connectDatabase = require('../config/database');
const User = require('../features/auth/user.model');
const { ROLES } = require('../config/constants');

const SALT_ROUNDS = 12;

const SEED_USERS = [
  {
    email: process.env.SEED_ADMIN_EMAIL || 'admin@elk-erp.com',
    password: process.env.SEED_ADMIN_PASSWORD || 'Admin@12345',
    firstName: 'System',
    lastName: 'Administrator',
    name: process.env.SEED_ADMIN_NAME || 'System Administrator',
    role: ROLES.ADMINISTRATOR,
  },
  {
    email: process.env.SEED_MANAGER_EMAIL || 'manager@elk-erp.com',
    password: process.env.SEED_MANAGER_PASSWORD || 'Manager@12345',
    firstName: 'Demo',
    lastName: 'Manager',
    name: process.env.SEED_MANAGER_NAME || 'Demo Manager',
    role: ROLES.MANAGER,
  },
  {
    email: process.env.SEED_DATA_ENTRY_EMAIL || 'dataentry@elk-erp.com',
    password: process.env.SEED_DATA_ENTRY_PASSWORD || 'DataEntry@12345',
    firstName: 'Demo',
    lastName: 'Data Entry',
    name: process.env.SEED_DATA_ENTRY_NAME || 'Demo Data Entry',
    role: ROLES.DATA_ENTRY,
  },
  {
    email: process.env.SEED_CONSULTANT_EMAIL || 'consultant@elk-erp.com',
    password: process.env.SEED_CONSULTANT_PASSWORD || 'Consultant@12345',
    firstName: 'Demo',
    lastName: 'Consultant',
    name: process.env.SEED_CONSULTANT_NAME || 'Demo Consultant',
    role: ROLES.CONSULTANT,
  },
];

const seedUsers = async () => {
  await connectDatabase();

  let created = 0;
  let skipped = 0;

  for (const userData of SEED_USERS) {
    const existingUser = await User.findOne({ email: userData.email });

    if (existingUser) {
      console.log(`Skipped (already exists): ${userData.email} [${userData.role}]`);
      skipped += 1;
      continue;
    }

    const hashedPassword = await bcrypt.hash(userData.password, SALT_ROUNDS);

    await User.create({
      firstName: userData.firstName,
      lastName: userData.lastName,
      name: userData.name,
      email: userData.email,
      password: hashedPassword,
      role: userData.role,
    });

    console.log(`Created: ${userData.email} [${userData.role}]`);
    created += 1;
  }

  console.log(`\nSeed complete. Created: ${created}, Skipped: ${skipped}`);
  process.exit(0);
};

seedUsers().catch((error) => {
  console.error('Seed failed:', error.message);
  process.exit(1);
});
