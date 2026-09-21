const { DQS_SYNC_REASONS, SYNC_STATUS } = require('../../config/constants');
const {
  buildItemsForProductCodes,
  buildSnapshotItems,
  resolveSourceUpdatedAt,
} = require('./dqsSync.payload');
const { isConfigured, postCarcassBasePrices } = require('./dqsSync.client');
const log = require('./dqsSync.log');
const env = require('../../config/env');

/** In-process last-run status for dashboard / ops (not persisted). */
let lastStatus = {
  status: isConfigured() ? SYNC_STATUS.WAITING : SYNC_STATUS.NO_INTEGRATION,
  lastSync: null,
  message: isConfigured()
    ? 'Waiting for first DQS push'
    : 'DQS_SYNC_URL / DQS_SYNC_TOKEN not configured',
  mode: null,
  reason: null,
  itemCount: 0,
};

log.info('Module loaded', {
  configured: isConfigured(),
  url: String(env.dqsSyncUrl || '').trim() || '(empty)',
  token: log.maskToken(env.dqsSyncToken),
  initialStatus: lastStatus.status,
});

const getLastStatus = () => ({ ...lastStatus });

const recordStatus = (patch) => {
  lastStatus = {
    ...lastStatus,
    ...patch,
    lastSync: new Date().toISOString(),
  };
  log.info('Status updated', getLastStatus());
  return getLastStatus();
};

const normalizeReason = (reason, fallback = DQS_SYNC_REASONS.HARDWARE_CASCADE) => {
  const value = String(reason || fallback).trim();
  const allowed = Object.values(DQS_SYNC_REASONS);
  return allowed.includes(value) ? value : fallback;
};

/**
 * Push delta of live VARIANT finish prices for the given catalogue product codes.
 * Never throws — callers must not roll back ELK on DQS failure.
 */
const syncDelta = async ({
  productCodes = [],
  reason = DQS_SYNC_REASONS.HARDWARE_CASCADE,
  sourceUpdatedAt = null,
} = {}) => {
  const codes = [
    ...new Set(
      (productCodes || [])
        .map((c) => String(c || '').trim())
        .filter(Boolean)
    ),
  ];

  log.info('syncDelta start', {
    reason,
    productCodesRequested: codes.length,
    sampleCodes: codes.slice(0, 10),
    configured: isConfigured(),
  });

  if (codes.length === 0) {
    const result = {
      ok: true,
      skipped: true,
      status: SYNC_STATUS.SYNCED,
      message: 'No product codes to sync to DQS',
      itemCount: 0,
      aggregate: null,
    };
    recordStatus({
      status: result.status,
      message: result.message,
      mode: 'delta',
      reason: normalizeReason(reason),
      itemCount: 0,
    });
    return result;
  }

  if (!isConfigured()) {
    const result = {
      ok: false,
      skipped: true,
      status: SYNC_STATUS.NO_INTEGRATION,
      message: 'DQS sync not configured (set DQS_SYNC_URL and DQS_SYNC_TOKEN)',
      itemCount: 0,
      aggregate: null,
    };
    recordStatus({
      status: result.status,
      message: result.message,
      mode: 'delta',
      reason: normalizeReason(reason),
      itemCount: 0,
    });
    return result;
  }

  const resolvedReason = normalizeReason(reason);
  const items = await buildItemsForProductCodes(codes);
  log.info('Payload built from live VARIANT prices', {
    requested: codes.length,
    ...log.summarizeItems(items),
  });

  const updatedAt =
    sourceUpdatedAt || (await resolveSourceUpdatedAt(codes));

  const postResult = await postCarcassBasePrices({
    mode: 'delta',
    reason: resolvedReason,
    sourceUpdatedAt: updatedAt,
    items,
  });

  let status = SYNC_STATUS.FAILED;
  if (postResult.ok || (postResult.skipped && items.length === 0)) {
    status = SYNC_STATUS.SYNCED;
  }

  const result = {
    ok: status === SYNC_STATUS.SYNCED,
    skipped: Boolean(postResult.skipped),
    status,
    message: postResult.message,
    itemCount: items.length,
    productCodesRequested: codes.length,
    aggregate: postResult.aggregate,
    abortAuth: Boolean(postResult.abortAuth),
  };

  recordStatus({
    status: result.status,
    message: result.message,
    mode: 'delta',
    reason: resolvedReason,
    itemCount: result.itemCount,
  });

  log.info('syncDelta done', {
    ok: result.ok,
    status: result.status,
    message: result.message,
    itemCount: result.itemCount,
    aggregate: result.aggregate,
  });

  return result;
};

/**
 * Full live catalogue snapshot (upsert, not wipe).
 */
const syncSnapshot = async ({
  reason = DQS_SYNC_REASONS.SNAPSHOT,
  sourceUpdatedAt = null,
} = {}) => {
  log.info('syncSnapshot start', { reason, configured: isConfigured() });

  if (!isConfigured()) {
    const result = {
      ok: false,
      skipped: true,
      status: SYNC_STATUS.NO_INTEGRATION,
      message: 'DQS sync not configured (set DQS_SYNC_URL and DQS_SYNC_TOKEN)',
      itemCount: 0,
      aggregate: null,
    };
    recordStatus({
      status: result.status,
      message: result.message,
      mode: 'snapshot',
      reason: normalizeReason(reason, DQS_SYNC_REASONS.SNAPSHOT),
      itemCount: 0,
    });
    return result;
  }

  const resolvedReason = normalizeReason(reason, DQS_SYNC_REASONS.SNAPSHOT);
  const items = await buildSnapshotItems();
  log.info('Snapshot payload built', log.summarizeItems(items));

  const updatedAt = sourceUpdatedAt || new Date().toISOString();

  const postResult = await postCarcassBasePrices({
    mode: 'snapshot',
    reason: resolvedReason,
    sourceUpdatedAt: updatedAt,
    items,
  });

  const result = {
    ok: Boolean(postResult.ok),
    skipped: Boolean(postResult.skipped),
    status: postResult.ok ? SYNC_STATUS.SYNCED : SYNC_STATUS.FAILED,
    message: postResult.message,
    itemCount: items.length,
    aggregate: postResult.aggregate,
    abortAuth: Boolean(postResult.abortAuth),
  };

  recordStatus({
    status: result.status,
    message: result.message,
    mode: 'snapshot',
    reason: resolvedReason,
    itemCount: result.itemCount,
  });

  log.info('syncSnapshot done', {
    ok: result.ok,
    status: result.status,
    message: result.message,
    itemCount: result.itemCount,
    aggregate: result.aggregate,
  });

  return result;
};

/**
 * Fire-and-forget delta (import / cascade paths that must not block).
 * Errors are logged; never thrown to the caller.
 */
const enqueueDelta = ({ productCodes, reason, sourceUpdatedAt } = {}) => {
  const codes = Array.isArray(productCodes) ? productCodes : [];
  if (codes.length === 0) {
    log.info('enqueueDelta skipped — empty productCodes', { reason });
    return;
  }

  log.info('enqueueDelta scheduled', {
    reason,
    productCodes: codes.length,
    sampleCodes: codes.slice(0, 10),
  });

  setImmediate(() => {
    syncDelta({ productCodes: codes, reason, sourceUpdatedAt }).catch((error) => {
      log.error('Background delta failed', {
        message: error.message || String(error),
      });
      recordStatus({
        status: SYNC_STATUS.FAILED,
        message: error.message || 'Background DQS delta failed',
        mode: 'delta',
        reason: normalizeReason(reason),
        itemCount: 0,
      });
    });
  });
};

module.exports = {
  syncDelta,
  syncSnapshot,
  enqueueDelta,
  getLastStatus,
  isConfigured,
};
