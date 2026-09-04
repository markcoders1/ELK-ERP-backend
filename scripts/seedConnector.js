require('dotenv').config();
const crypto = require('crypto');
const bcrypt = require('bcrypt');
const connectDatabase = require('../config/database');
const Connector = require('../features/winner-connector/connector.model');

const seedConnector = async () => {
  await connectDatabase();

  const connectorId =
    process.env.SEED_CONNECTOR_ID || `conn_${crypto.randomBytes(8).toString('hex')}`;
  const name = process.env.SEED_CONNECTOR_NAME || 'Default Winner Desktop Connector';
  const providedToken = process.env.SEED_CONNECTOR_TOKEN;
  const token = providedToken || crypto.randomBytes(32).toString('hex');

  const existing = await Connector.findOne({ connectorId });

  if (existing) {
    console.log('Connector already exists — not rotating token.');
    console.log(`connectorId: ${connectorId}`);
    console.log('To rotate: delete the document or set a new SEED_CONNECTOR_ID.');
    process.exit(0);
  }

  const tokenHash = await bcrypt.hash(token, 12);

  await Connector.create({
    connectorId,
    name,
    tokenHash,
    isActive: true,
    notes: 'Created by seed:connector',
  });

  console.log('Winner Desktop Connector created.');
  console.log('');
  console.log('Configure the desktop connector with:');
  console.log(`  connectorId:    ${connectorId}`);
  console.log(`  connectorToken: ${token}`);
  console.log('');
  console.log('Store the token securely. It will not be shown again.');
  console.log(
    'API base (production): https://anton.markcoders.com/ELK-ERP-backend/api'
  );
  console.log('Import path: POST /integrations/winner/import');

  process.exit(0);
};

seedConnector().catch((error) => {
  console.error('Seed failed:', error.message);
  process.exit(1);
});
