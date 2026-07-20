const express = require('express');
const hardwareApprovalsController = require('./hardwareApprovals.controller');
const authenticate = require('../auth/auth.middleware');
const authorizeRoles = require('../../middlewares/role');
const validate = require('../../middlewares/validate');
const {
  APPROVAL_SUBMIT_ROLES,
  APPROVAL_REVIEW_ROLES,
} = require('../../config/constants');
const {
  idParamRules,
  rejectRules,
  listQueryRules,
  auditQueryRules,
  notificationIdRules,
} = require('./hardwareApprovals.validator');

const router = express.Router();

router.use(authenticate);

router.get(
  '/dashboard-summary',
  hardwareApprovalsController.dashboardSummary
);

router.get(
  '/audit',
  validate(auditQueryRules),
  hardwareApprovalsController.auditTrail
);

router.get(
  '/notifications',
  hardwareApprovalsController.listNotifications
);

router.patch(
  '/notifications/:id/read',
  validate(notificationIdRules),
  hardwareApprovalsController.markNotificationRead
);

router.get(
  '/',
  validate(listQueryRules),
  hardwareApprovalsController.list
);

router.get(
  '/:id',
  validate(idParamRules),
  hardwareApprovalsController.getById
);

router.post(
  '/:id/approve',
  authorizeRoles(...APPROVAL_REVIEW_ROLES),
  validate(idParamRules),
  hardwareApprovalsController.approve
);

router.post(
  '/:id/reject',
  authorizeRoles(...APPROVAL_REVIEW_ROLES),
  validate(rejectRules),
  hardwareApprovalsController.reject
);

module.exports = router;
