const excelSyncService = require('./excelSync.service');
const sendResponse = require('../../utils/apiResponse');
const asyncHandler = require('../../utils/asyncHandler');
const { HTTP_STATUS } = require('../../config/constants');

const submit = asyncHandler(async (req, res) => {
  const requestId =
    req.excelSync?.requestId ||
    req.headers['x-request-id'] ||
    req.headers['idempotency-key'] ||
    null;

  const data = await excelSyncService.submitSync({
    body: req.body,
    user: req.user,
    requestId,
  });

  return sendResponse(res, {
    message: 'Excel Sync processed',
    data,
    statusCode: HTTP_STATUS.OK,
  });
});

module.exports = {
  submit,
};
