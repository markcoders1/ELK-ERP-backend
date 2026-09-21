const dqsSyncService = require('./dqsSync.service');
const sendResponse = require('../../utils/apiResponse');
const asyncHandler = require('../../utils/asyncHandler');
const { HTTP_STATUS, DQS_SYNC_REASONS, SYNC_STATUS } = require('../../config/constants');

/**
 * Admin ops: push full live catalogue finish matrix to DQS (mode=snapshot).
 */
const pushSnapshot = asyncHandler(async (req, res) => {
  const reason =
    req.body?.reason === DQS_SYNC_REASONS.REPLAY
      ? DQS_SYNC_REASONS.REPLAY
      : DQS_SYNC_REASONS.SNAPSHOT;

  const result = await dqsSyncService.syncSnapshot({ reason });

  return sendResponse(res, {
    message: result.message,
    data: {
      ok: result.ok,
      status: result.status,
      itemCount: result.itemCount,
      aggregate: result.aggregate,
      lastStatus: dqsSyncService.getLastStatus(),
    },
    statusCode: result.ok
      ? HTTP_STATUS.OK
      : result.status === SYNC_STATUS.NO_INTEGRATION
        ? HTTP_STATUS.BAD_REQUEST
        : HTTP_STATUS.INTERNAL_SERVER_ERROR,
  });
});

const getStatus = asyncHandler(async (_req, res) => {
  return sendResponse(res, {
    message: 'DQS sync status',
    data: {
      configured: dqsSyncService.isConfigured(),
      lastStatus: dqsSyncService.getLastStatus(),
    },
    statusCode: HTTP_STATUS.OK,
  });
});

module.exports = {
  pushSnapshot,
  getStatus,
};
