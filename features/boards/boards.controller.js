const boardsService = require('./boards.service');
const sendResponse = require('../../utils/apiResponse');
const asyncHandler = require('../../utils/asyncHandler');
const { HTTP_STATUS } = require('../../config/constants');

const list = asyncHandler(async (req, res) => {
  const result = await boardsService.findAll(req.query);

  return sendResponse(res, {
    message: 'Boards fetched successfully',
    data: result,
    statusCode: HTTP_STATUS.OK,
  });
});

const getById = asyncHandler(async (req, res) => {
  const item = await boardsService.findById(req.params.id);

  return sendResponse(res, {
    message: 'Board fetched successfully',
    data: { item },
    statusCode: HTTP_STATUS.OK,
  });
});

const create = asyncHandler(async (req, res) => {
  const item = await boardsService.create(req.body, req.user.id);

  return sendResponse(res, {
    message: 'Board created successfully',
    data: { item },
    statusCode: HTTP_STATUS.CREATED,
  });
});

const update = asyncHandler(async (req, res) => {
  const item = await boardsService.update(req.params.id, req.body, req.user.id);

  return sendResponse(res, {
    message: 'Board updated successfully',
    data: { item },
    statusCode: HTTP_STATUS.OK,
  });
});

const remove = asyncHandler(async (req, res) => {
  const item = await boardsService.softDelete(req.params.id, req.user.id);

  return sendResponse(res, {
    message: 'Board deleted successfully',
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
