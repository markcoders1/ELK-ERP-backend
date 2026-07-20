const usersService = require('./users.service');
const sendResponse = require('../../utils/apiResponse');
const asyncHandler = require('../../utils/asyncHandler');
const { HTTP_STATUS } = require('../../config/constants');

const list = asyncHandler(async (req, res) => {
  const result = await usersService.findAll(req.query);

  return sendResponse(res, {
    message: 'Users fetched successfully',
    data: result,
    statusCode: HTTP_STATUS.OK,
  });
});

const getById = asyncHandler(async (req, res) => {
  const user = await usersService.findById(req.params.id);

  return sendResponse(res, {
    message: 'User fetched successfully',
    data: { user },
    statusCode: HTTP_STATUS.OK,
  });
});

const create = asyncHandler(async (req, res) => {
  const user = await usersService.create(req.body, req.user.id);

  return sendResponse(res, {
    message: 'User created successfully',
    data: { user },
    statusCode: HTTP_STATUS.CREATED,
  });
});

const update = asyncHandler(async (req, res) => {
  const user = await usersService.update(req.params.id, req.body, req.user.id);

  return sendResponse(res, {
    message: 'User updated successfully',
    data: { user },
    statusCode: HTTP_STATUS.OK,
  });
});

const resetPassword = asyncHandler(async (req, res) => {
  const result = await usersService.resetPassword(req.params.id, req.user.id);

  return sendResponse(res, {
    message: result.message,
    data: {
      user: result.user,
      temporaryPassword: result.temporaryPassword,
    },
    statusCode: HTTP_STATUS.OK,
  });
});

const summary = asyncHandler(async (req, res) => {
  const summaryData = await usersService.getSummary();

  return sendResponse(res, {
    message: 'User summary fetched successfully',
    data: { summary: summaryData },
    statusCode: HTTP_STATUS.OK,
  });
});

module.exports = {
  list,
  getById,
  create,
  update,
  resetPassword,
  summary,
};
