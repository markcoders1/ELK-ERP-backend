const { SYNC_STATUS } = require('../../config/constants');

/**
 * Downstream sync placeholder.
 * Real Winner / EKOOMS / Dynamic Quote / Consultant List integrations are deferred.
 * approve() calls trigger() and records pending targets on the change request.
 */
const DOWNSTREAM_TARGETS = [
  { id: 'winner', name: 'Winner' },
  { id: 'ekooms', name: 'EKOOMS' },
  { id: 'dynamic-quote', name: 'Dynamic Quote' },
  { id: 'consultant-list', name: 'Consultant List' },
];

const trigger = async ({ changeRequestId, stockCode, entityType }) => {
  const at = new Date();

  const logs = DOWNSTREAM_TARGETS.map((target) => ({
    at,
    target: target.name,
    status: SYNC_STATUS.PENDING,
    message: `Placeholder sync queued for ${target.name} (${entityType} ${stockCode || changeRequestId}). Integration not connected.`,
  }));

  return {
    syncStatus: SYNC_STATUS.PENDING,
    syncLogs: logs,
    targets: DOWNSTREAM_TARGETS.map((t) => ({
      ...t,
      status: SYNC_STATUS.PENDING,
    })),
  };
};

const getPlaceholderStatus = () => ({
  overall: SYNC_STATUS.WAITING,
  label: 'No Integration',
  targets: DOWNSTREAM_TARGETS.map((t) => ({
    id: t.id,
    name: t.name,
    status: SYNC_STATUS.NO_INTEGRATION,
    lastSync: null,
  })),
});

module.exports = {
  trigger,
  getPlaceholderStatus,
  DOWNSTREAM_TARGETS,
};
