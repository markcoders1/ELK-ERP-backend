const fcComponentsService = require('./fcComponents.service');
const sendResponse = require('../../utils/apiResponse');
const asyncHandler = require('../../utils/asyncHandler');
const { HTTP_STATUS } = require('../../config/constants');

const list = asyncHandler(async (req, res) => {
  const result = await fcComponentsService.findAll(req.query);

  return sendResponse(res, {
    message: 'FC component lines fetched successfully',
    data: result,
    statusCode: HTTP_STATUS.OK,
  });
});

const listByProductCode = asyncHandler(async (req, res) => {
  const items = await fcComponentsService.findByProductCode(req.params.productCode);

  return sendResponse(res, {
    message: 'FC component lines fetched successfully',
    data: { items },
    statusCode: HTTP_STATUS.OK,
  });
});

const getById = asyncHandler(async (req, res) => {
  const item = await fcComponentsService.findById(req.params.id);

  return sendResponse(res, {
    message: 'FC component line fetched successfully',
    data: { item },
    statusCode: HTTP_STATUS.OK,
  });
});

const create = asyncHandler(async (req, res) => {
  const item = await fcComponentsService.create(req.body);

  return sendResponse(res, {
    message: 'FC component line created successfully',
    data: { item },
    statusCode: HTTP_STATUS.CREATED,
  });
});

const update = asyncHandler(async (req, res) => {
  const item = await fcComponentsService.update(req.params.id, req.body);

  return sendResponse(res, {
    message: 'FC component line updated successfully',
    data: { item },
    statusCode: HTTP_STATUS.OK,
  });
});

const remove = asyncHandler(async (req, res) => {
  const item = await fcComponentsService.softDelete(req.params.id);

  return sendResponse(res, {
    message: 'FC component line deleted successfully',
    data: { item },
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
};
