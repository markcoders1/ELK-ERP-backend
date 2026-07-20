const hardwareApprovalsService = require('./hardwareApprovals.service');
const notificationService = require('./notification.service');
const sendResponse = require('../../utils/apiResponse');
const asyncHandler = require('../../utils/asyncHandler');
const { HTTP_STATUS } = require('../../config/constants');

const list = asyncHandler(async (req, res) => {
  const result = await hardwareApprovalsService.findAll(req.query);

  return sendResponse(res, {
    message: 'Change requests fetched successfully',
    data: result,
    statusCode: HTTP_STATUS.OK,
  });
});

const getById = asyncHandler(async (req, res) => {
  const item = await hardwareApprovalsService.findById(req.params.id);

  return sendResponse(res, {
    message: 'Change request fetched successfully',
    data: { item },
    statusCode: HTTP_STATUS.OK,
  });
});

const submitCreate = asyncHandler(async (req, res) => {
  const item = await hardwareApprovalsService.submitCreate(req.body, req.user);

  return sendResponse(res, {
    message: 'Hardware create request submitted for approval',
    data: { item },
    statusCode: HTTP_STATUS.CREATED,
  });
});

const submitUpdate = asyncHandler(async (req, res) => {
  const item = await hardwareApprovalsService.submitUpdate(req.params.id, req.body, req.user);

  return sendResponse(res, {
    message: 'Hardware update request submitted for approval',
    data: { item },
    statusCode: HTTP_STATUS.CREATED,
  });
});

const approve = asyncHandler(async (req, res) => {
  const item = await hardwareApprovalsService.approve(req.params.id, req.user);

  return sendResponse(res, {
    message: 'Change request approved successfully',
    data: { item },
    statusCode: HTTP_STATUS.OK,
  });
});

const reject = asyncHandler(async (req, res) => {
  const item = await hardwareApprovalsService.reject(req.params.id, req.body, req.user);

  return sendResponse(res, {
    message: 'Change request rejected successfully',
    data: { item },
    statusCode: HTTP_STATUS.OK,
  });
});

const dashboardSummary = asyncHandler(async (req, res) => {
  const summary = await hardwareApprovalsService.getDashboardSummary(req.user.id);

  return sendResponse(res, {
    message: 'Dashboard summary fetched successfully',
    data: { summary },
    statusCode: HTTP_STATUS.OK,
  });
});

const auditTrail = asyncHandler(async (req, res) => {
  const result = await hardwareApprovalsService.findAuditTrail(req.query);

  return sendResponse(res, {
    message: 'Audit trail fetched successfully',
    data: result,
    statusCode: HTTP_STATUS.OK,
  });
});

const listNotifications = asyncHandler(async (req, res) => {
  const items = await notificationService.listForUser(req.user.id, {
    limit: Number(req.query.limit) || 20,
  });

  return sendResponse(res, {
    message: 'Notifications fetched successfully',
    data: { items },
    statusCode: HTTP_STATUS.OK,
  });
});

const markNotificationRead = asyncHandler(async (req, res) => {
  const item = await notificationService.markRead(req.params.id, req.user.id);

  return sendResponse(res, {
    message: item ? 'Notification marked as read' : 'Notification not found',
    data: { item },
    statusCode: HTTP_STATUS.OK,
  });
});

module.exports = {
  list,
  getById,
  submitCreate,
  submitUpdate,
  approve,
  reject,
  dashboardSummary,
  auditTrail,
  listNotifications,
  markNotificationRead,
};
