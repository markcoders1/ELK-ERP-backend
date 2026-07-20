const hardwareService = require('./hardware.service');
const hardwareApprovalsController = require('../hardware-approvals/hardwareApprovals.controller');
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

/**
 * Create / update no longer write the catalogue directly.
 * They submit pending change requests (approval workflow).
 * Catalogue mutations happen only on approve via hardware.service.
 */
const create = hardwareApprovalsController.submitCreate;
const update = hardwareApprovalsController.submitUpdate;
const submitCreate = hardwareApprovalsController.submitCreate;
const submitUpdate = hardwareApprovalsController.submitUpdate;

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
  submitCreate,
  submitUpdate,
  remove,
};
