const hardwareService = require('./hardware.service');
const sendResponse = require('../../utils/apiResponse');
const asyncHandler = require('../../utils/asyncHandler');
const { HTTP_STATUS } = require('../../config/constants');

const list = asyncHandler(async (req, res) => {
  const result = await hardwareService.findAll(req.query);

  return sendResponse(res, {
    message: 'Hardware items fetched successfully',
    data: result,
    statusCode: HTTP_STATUS.OK,
  });
});

const getById = asyncHandler(async (req, res) => {
  const item = await hardwareService.findById(req.params.id);

  return sendResponse(res, {
    message: 'Hardware item fetched successfully',
    data: { item },
    statusCode: HTTP_STATUS.OK,
  });
});

const create = asyncHandler(async (req, res) => {
  const item = await hardwareService.create(req.body, req.user.id);

  return sendResponse(res, {
    message: 'Hardware item created successfully',
    data: { item },
    statusCode: HTTP_STATUS.CREATED,
  });
});

const update = asyncHandler(async (req, res) => {
  const item = await hardwareService.update(req.params.id, req.body, req.user.id);

  return sendResponse(res, {
    message: 'Hardware item updated successfully',
    data: { item },
    statusCode: HTTP_STATUS.OK,
  });
});

const remove = asyncHandler(async (req, res) => {
  const item = await hardwareService.softDelete(req.params.id, req.user.id);

  return sendResponse(res, {
    message: 'Hardware item deleted successfully',
    data: { item },
    statusCode: HTTP_STATUS.OK,
  });
});

module.exports = {
  list,
  getById,
  create,
  update,
  remove,
};
