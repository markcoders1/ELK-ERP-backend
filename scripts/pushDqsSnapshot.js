#!/usr/bin/env node
/**
 * Ops: push full live catalogue VARIANT finish prices to DQS (mode=snapshot).
 *
 * Usage (from server/):
 *   npm run dqs:snapshot
 *   node scripts/pushDqsSnapshot.js
 *   node scripts/pushDqsSnapshot.js --replay
 *
 * Requires DQS_SYNC_URL + DQS_SYNC_TOKEN in server/.env
 */
require('dotenv').config();

const mongoose = require('mongoose');
const env = require('../config/env');
const { DQS_SYNC_REASONS } = require('../config/constants');
const dqsSyncService = require('../features/dqs-sync/dqsSync.service');

const main = async () => {
  const replay = process.argv.includes('--replay');
  const reason = replay ? DQS_SYNC_REASONS.REPLAY : DQS_SYNC_REASONS.SNAPSHOT;

  if (!dqsSyncService.isConfigured()) {
    console.error('DQS sync is not configured. Set DQS_SYNC_URL and DQS_SYNC_TOKEN.');
    process.exit(1);
  }

  console.log(`Connecting to MongoDB…`);
  await mongoose.connect(env.mongodbUri);
  console.log(`Pushing DQS snapshot (reason=${reason})…`);

  const result = await dqsSyncService.syncSnapshot({ reason });
  console.log(JSON.stringify(result, null, 2));

  await mongoose.disconnect();
  process.exit(result.ok ? 0 : 1);
};

main().catch(async (error) => {
  console.error(error);
  try {
    await mongoose.disconnect();
  } catch {
    // ignore
  }
  process.exit(1);
});
