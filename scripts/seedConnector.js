require('dotenv').config();
const crypto = require('crypto');
const readline = require('readline');
const connectDatabase = require('../config/database');
const Connector = require('../features/winner-connector/connector.model');
const {
  createConnectorDevice,
  getConnectorApiBaseUrl,
} = require('../features/winner-connector/winnerConnector.service');

const ask = (rl, question, fallback = '') =>
  new Promise((resolve) => {
    const hint = fallback ? ` [${fallback}]` : '';
    rl.question(`${question}${hint}: `, (answer) => {
      const trimmed = String(answer || '').trim();
      resolve(trimmed || fallback);
    });
  });

const resolveInputs = async () => {
  const fromEnv = {
    connectorId: process.env.SEED_CONNECTOR_ID || '',
    name: process.env.SEED_CONNECTOR_NAME || '',
    token: process.env.SEED_CONNECTOR_TOKEN || '',
  };

  const hasAllEnv = Boolean(fromEnv.connectorId && fromEnv.name);
  if (hasAllEnv || !process.stdin.isTTY) {
    return {
      connectorId: fromEnv.connectorId || `conn_${crypto.randomBytes(8).toString('hex')}`,
      name: fromEnv.name || 'Default Winner Desktop Connector',
      token: fromEnv.token || '',
      interactive: false,
    };
  }

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    console.log('Create a Winner Desktop Connector credential for one PC.');
    console.log('The name is shown on Winner Imports so you can see which PC sent each file.\n');

    const name = await ask(
      rl,
      'Assignee / PC name (e.g. "Showroom PC - Fatima")',
      fromEnv.name || ''
    );
    if (!name) {
      throw new Error('Name is required so imports can be traced to a person/PC');
    }

    const connectorId = await ask(
      rl,
      'Connector ID (leave blank to generate)',
      fromEnv.connectorId || `conn_${crypto.randomBytes(8).toString('hex')}`
    );

    return {
      connectorId,
      name,
      token: fromEnv.token || '',
      interactive: true,
    };
  } finally {
    rl.close();
  }
};

const seedConnector = async () => {
  await connectDatabase();

  const { connectorId, name, token, interactive } = await resolveInputs();
  const existing = await Connector.findOne({ connectorId });

  if (existing) {
    const previousName = existing.name;
    if (name && name !== previousName) {
      existing.name = name;
      existing.notes = existing.notes || 'Updated by seed:connector';
      await existing.save();
      console.log('Connector already exists — token unchanged; name updated.');
      console.log(`  connectorId: ${connectorId}`);
      console.log(`  name:        ${previousName} → ${name}`);
    } else {
      console.log('Connector already exists — not rotating token.');
      console.log(`  connectorId: ${connectorId}`);
      console.log(`  name:        ${existing.name}`);
      console.log('To rename: re-run with SEED_CONNECTOR_NAME="New label" (and same SEED_CONNECTOR_ID).');
      console.log('To create another PC: omit SEED_CONNECTOR_ID so a new id is generated.');
    }
    process.exit(0);
  }

  const created = await createConnectorDevice({
    name,
    connectorId,
    token: token || undefined,
    notes: interactive
      ? `Created by seed:connector for ${name}`
      : 'Created by seed:connector',
  });

  const apiBaseUrl = created.apiBaseUrl || getConnectorApiBaseUrl();

  console.log('Winner Desktop Connector created.');
  console.log('');
  console.log('Configure the desktop connector with:');
  console.log(`  name:           ${created.name}`);
  console.log(`  connectorId:    ${created.connectorId}`);
  console.log(`  connectorToken: ${created.connectorToken}`);
  if (apiBaseUrl) {
    console.log(`  apiBaseUrl:     ${apiBaseUrl}`);
  } else {
    console.log(
      '  apiBaseUrl:     (set WINNER_CONNECTOR_API_BASE in server .env, e.g. https://your-host/api)'
    );
  }
  console.log('');
  console.log('Store the token securely. It will not be shown again.');
  console.log('Import path: POST /integrations/winner/import');
  console.log('Prefer creating devices from Winner Imports → Add New Device (Administrator).');

  process.exit(0);
};

seedConnector().catch((error) => {
  console.error('Seed failed:', error.message);
  process.exit(1);
});
