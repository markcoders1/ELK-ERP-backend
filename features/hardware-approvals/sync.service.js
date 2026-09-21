const { SYNC_STATUS, ENTITY_TYPES, DQS_SYNC_REASONS } = require('../../config/constants');
const hwComponentsService = require('../hw-components/hwComponents.service');
const dqsSyncService = require('../dqs-sync/dqsSync.service');
const log = require('../dqs-sync/dqsSync.log');

/**
 * Downstream sync fan-out.
 * Winner / EKOOMS / Consultant List remain placeholders until those teams are ready.
 * Dynamic Quote (DQS) is the first real adapter: live catalogue VARIANT finish prices
 * after cascade / component approve — never hardware CR snapshots.
 */
const DOWNSTREAM_TARGETS = [
  { id: 'winner', name: 'Winner' },
  { id: 'ekooms', name: 'EKOOMS' },
  { id: 'dynamic-quote', name: 'Dynamic Quote' },
  { id: 'consultant-list', name: 'Consultant List' },
];

const placeholderLog = (target, { changeRequestId, stockCode, entityType }) => ({
  at: new Date(),
  target: target.name,
  status: SYNC_STATUS.PENDING,
  message: `Placeholder sync queued for ${target.name} (${entityType} ${stockCode || changeRequestId}). Integration not connected.`,
});

/**
 * Resolve catalogue product codes for a hardware stock code (post-cascade grain).
 */
const resolveHardwareProductCodes = async (stockCode) => {
  if (!stockCode) return [];
  return hwComponentsService.distinctProductCodesForHardwareItem(stockCode);
};

/**
 * Real Dynamic Quote adapter — reads live VARIANT prices and POSTs to DQS.
 * Never throws; failures become FAILED logs so approve() is not blocked.
 */
const runDynamicQuoteAdapter = async ({ stockCode, entityType, changeRequestId }) => {
  const at = new Date();
  const targetName = 'Dynamic Quote';

  log.info('Approve → Dynamic Quote adapter start', {
    changeRequestId,
    entityType,
    stockCode,
    dqsConfigured: dqsSyncService.isConfigured(),
  });

  try {
    let productCodes = [];
    let reason = DQS_SYNC_REASONS.HARDWARE_CASCADE;

    if (entityType === ENTITY_TYPES.COMPONENT) {
      productCodes = stockCode ? [stockCode] : [];
      reason = DQS_SYNC_REASONS.COMPONENT_FINISH;
    } else {
      productCodes = await resolveHardwareProductCodes(stockCode);
      reason = DQS_SYNC_REASONS.HARDWARE_CASCADE;
      log.info('Resolved catalogue products for hardware', {
        stockCode,
        productCount: productCodes.length,
        sampleCodes: productCodes.slice(0, 15),
      });
    }

    if (productCodes.length === 0) {
      const message =
        entityType === ENTITY_TYPES.COMPONENT
          ? 'No component code to sync to DQS'
          : `No catalogue products reference hardware ${stockCode || '—'}; DQS delta skipped`;
      log.warn(message);
      // Updates dashboard last-status so it does not stay on Waiting forever.
      await dqsSyncService.syncDelta({
        productCodes: [],
        reason,
        sourceUpdatedAt: at.toISOString(),
      });
      return {
        at,
        target: targetName,
        status: SYNC_STATUS.SYNCED,
        message,
      };
    }

    const result = await dqsSyncService.syncDelta({
      productCodes,
      reason,
      sourceUpdatedAt: at.toISOString(),
    });

    log.info('Approve → Dynamic Quote adapter result', {
      status: result.status,
      message: result.message,
      itemCount: result.itemCount,
      ok: result.ok,
    });

    return {
      at,
      target: targetName,
      status: result.status || (result.ok ? SYNC_STATUS.SYNCED : SYNC_STATUS.FAILED),
      message:
        result.message ||
        `DQS delta for ${productCodes.length} product code(s)`,
    };
  } catch (error) {
    log.error('Approve → Dynamic Quote adapter threw', {
      message: error.message || String(error),
      stack: error.stack,
    });
    return {
      at,
      target: targetName,
      status: SYNC_STATUS.FAILED,
      message: error.message || 'DQS sync failed unexpectedly',
    };
  }
};

const trigger = async ({ changeRequestId, stockCode, entityType }) => {
  log.info('sync.service.trigger', { changeRequestId, stockCode, entityType });
  const logs = [];

  // eslint-disable-next-line no-restricted-syntax
  for (const target of DOWNSTREAM_TARGETS) {
    if (target.id === 'dynamic-quote') {
      // eslint-disable-next-line no-await-in-loop
      logs.push(
        await runDynamicQuoteAdapter({ stockCode, entityType, changeRequestId })
      );
    } else {
      logs.push(placeholderLog(target, { changeRequestId, stockCode, entityType }));
    }
  }

  const dqsLog = logs.find((l) => l.target === 'Dynamic Quote');
  const overall =
    dqsLog?.status === SYNC_STATUS.FAILED
      ? SYNC_STATUS.FAILED
      : dqsLog?.status === SYNC_STATUS.SYNCED ||
          dqsLog?.status === SYNC_STATUS.NO_INTEGRATION
        ? dqsLog.status
        : SYNC_STATUS.PENDING;

  log.info('sync.service.trigger complete', {
    overall,
    dqsStatus: dqsLog?.status,
    dqsMessage: dqsLog?.message,
  });

  return {
    syncStatus: overall,
    syncLogs: logs,
    targets: DOWNSTREAM_TARGETS.map((t) => {
      const entry = logs.find((l) => l.target === t.name);
      return {
        ...t,
        status: entry?.status || SYNC_STATUS.PENDING,
      };
    }),
  };
};

const getPlaceholderStatus = () => {
  const dqs = dqsSyncService.getLastStatus();

  return {
    overall: dqs.status || SYNC_STATUS.WAITING,
    label: dqsSyncService.isConfigured() ? 'DQS connected' : 'No Integration',
    targets: DOWNSTREAM_TARGETS.map((t) => {
      if (t.id === 'dynamic-quote') {
        return {
          id: t.id,
          name: t.name,
          status: dqs.status || SYNC_STATUS.NO_INTEGRATION,
          lastSync: dqs.lastSync || null,
          message: dqs.message || null,
        };
      }
      return {
        id: t.id,
        name: t.name,
        status: SYNC_STATUS.NO_INTEGRATION,
        lastSync: null,
      };
    }),
  };
};

module.exports = {
  trigger,
  getPlaceholderStatus,
  DOWNSTREAM_TARGETS,
};
