const hwComponentsService = require('./hwComponents.service');
const sendResponse = require('../../utils/apiResponse');
const asyncHandler = require('../../utils/asyncHandler');
const { HTTP_STATUS } = require('../../config/constants');

const list = asyncHandler(async (req, res) => {
  const result = await hwComponentsService.findAll(req.query);

  return sendResponse(res, {
    message: 'HW component lines fetched successfully',
    data: result,
    statusCode: HTTP_STATUS.OK,
  });
});

const listByProductCode = asyncHandler(async (req, res) => {
  const items = await hwComponentsService.findByProductCode(req.params.productCode);

  return sendResponse(res, {
    message: 'HW component lines fetched successfully',
    data: { items },
    statusCode: HTTP_STATUS.OK,
  });
});

const getById = asyncHandler(async (req, res) => {
  const item = await hwComponentsService.findById(req.params.id);

  return sendResponse(res, {
    message: 'HW component line fetched successfully',
    data: { item },
    statusCode: HTTP_STATUS.OK,
  });
});

const create = asyncHandler(async (req, res) => {
  const item = await hwComponentsService.create(req.body);

  return sendResponse(res, {
    message: 'HW component line created successfully',
    data: { item },
    statusCode: HTTP_STATUS.CREATED,
  });
});

const update = asyncHandler(async (req, res) => {
  const item = await hwComponentsService.update(req.params.id, req.body);

  return sendResponse(res, {
    message: 'HW component line updated successfully',
    data: { item },
    statusCode: HTTP_STATUS.OK,
  });
});

const remove = asyncHandler(async (req, res) => {
  const item = await hwComponentsService.softDelete(req.params.id);

  return sendResponse(res, {
    message: 'HW component line deleted successfully',
    data: { item },
    statusCode: HTTP_STATUS.OK,
  });
});

const recalculate = asyncHandler(async (req, res) => {
  const result = await hwComponentsService.recalculateCostsForHardwareItem(
    req.params.itemCode
  );

  return sendResponse(res, {
    message: 'HW component costs recalculated successfully',
    data: result,
    statusCode: HTTP_STATUS.OK,
  });
});

module.exports = {
  list,
  listByProductCode,
  getById,
  create,
  update,
  remove,
  recalculate,
};
