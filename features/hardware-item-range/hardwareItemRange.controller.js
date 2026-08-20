const hardwareItemRangeService = require('./hardwareItemRange.service');
const sendResponse = require('../../utils/apiResponse');
const asyncHandler = require('../../utils/asyncHandler');
const { HTTP_STATUS } = require('../../config/constants');

const list = asyncHandler(async (req, res) => {
  const result = await hardwareItemRangeService.findAll(req.query);

  return sendResponse(res, {
    message: 'Hardware item range fetched successfully',
    data: result,
    statusCode: HTTP_STATUS.OK,
  });
});

const getByItemCode = asyncHandler(async (req, res) => {
  const item = await hardwareItemRangeService.findByItemCode(req.params.itemCode);

  return sendResponse(res, {
    message: 'Hardware item range fetched successfully',
    data: { item },
    statusCode: HTTP_STATUS.OK,
  });
});

module.exports = {
  list,
  getByItemCode,
};
