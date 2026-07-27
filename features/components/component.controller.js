const componentService = require('./component.service');
const componentApprovalsService = require('../component-approvals/componentApprovals.service');
const sendResponse = require('../../utils/apiResponse');
const asyncHandler = require('../../utils/asyncHandler');
const { HTTP_STATUS } = require('../../config/constants');

const list = asyncHandler(async (req, res) => {
  const result = await componentService.findAll(req.query, { role: req.user.role });

  return sendResponse(res, {
    message: 'Components fetched successfully',
    data: result,
    statusCode: HTTP_STATUS.OK,
  });
});

const getById = asyncHandler(async (req, res) => {
  const item = await componentService.findById(req.params.id, { role: req.user.role });

  return sendResponse(res, {
    message: 'Component fetched successfully',
    data: { item },
    statusCode: HTTP_STATUS.OK,
  });
});

const listSections = asyncHandler(async (req, res) => {
  const sections = await componentService.listSections(req.params.id);

  return sendResponse(res, {
    message: 'Sections fetched successfully',
    data: { sections },
    statusCode: HTTP_STATUS.OK,
  });
});

const listSectionItems = asyncHandler(async (req, res) => {
  const result = await componentService.listSectionItems(
    req.params.id,
    req.params.sectionId,
    { role: req.user.role }
  );

  return sendResponse(res, {
    message: 'Section items fetched successfully',
    data: result,
    statusCode: HTTP_STATUS.OK,
  });
});

const listVersions = asyncHandler(async (req, res) => {
  const versions = await componentService.listVersions(req.params.id);

  return sendResponse(res, {
    message: 'Component versions fetched successfully',
    data: { versions },
    statusCode: HTTP_STATUS.OK,
  });
});

const create = asyncHandler(async (req, res) => {
  const changeRequest = await componentApprovalsService.submitCreate(req.body, req.user);

  return sendResponse(res, {
    message: 'Component create request submitted for approval',
    data: { changeRequest },
    statusCode: HTTP_STATUS.CREATED,
  });
});

const update = asyncHandler(async (req, res) => {
  const changeRequest = await componentApprovalsService.submitUpdate(
    req.params.id,
    req.body,
    req.user
  );

  return sendResponse(res, {
    message: 'Component update request submitted for approval',
    data: { changeRequest },
    statusCode: HTTP_STATUS.OK,
  });
});

const updateSection = asyncHandler(async (req, res) => {
  const changeRequest = await componentApprovalsService.submitUpdate(
    req.params.id,
    {
      sectionType: req.params.sectionType,
      items: req.body.items,
      sectionName: req.body.sectionName,
      sectionMeta: req.body.sectionMeta,
      comments: req.body.comments,
    },
    req.user
  );

  return sendResponse(res, {
    message: 'Section update request submitted for approval',
    data: { changeRequest },
    statusCode: HTTP_STATUS.OK,
  });
});

const remove = asyncHandler(async (req, res) => {
  const item = await componentService.softDelete(req.params.id, req.user.id);

  return sendResponse(res, {
    message: 'Component deleted successfully',
    data: { item },
    statusCode: HTTP_STATUS.OK,
  });
});

module.exports = {
  list,
  getById,
  listSections,
  listSectionItems,
  listVersions,
  create,
  update,
  updateSection,
  submitCreate: create,
  submitUpdate: update,
  remove,
};
