const { body, param, query } = require('express-validator');
const {
  ALL_CHANGE_REQUEST_ACTIONS,
  ALL_CHANGE_REQUEST_STATUSES,
  ALL_AUDIT_DECISIONS,
  CHANGE_REQUEST_SORT_FIELDS,
  AUDIT_SORT_FIELDS,
} = require('../../config/constants');
const {
  createRules: hardwareCreateRules,
  updateRules: hardwareUpdateRules,
} = require('../hardware/hardware.validator');

const idParamRules = [param('id').isMongoId().withMessage('Invalid change request id')];

const rejectRules = [
  ...idParamRules,
  body('reason')
    .trim()
    .notEmpty()
    .withMessage('Rejection reason is required')
    .isLength({ max: 2000 })
    .withMessage('Rejection reason must be at most 2000 characters'),
];

const listQueryRules = [
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
  query('search').optional().trim(),
  query('status').optional().isIn(ALL_CHANGE_REQUEST_STATUSES),
  query('action').optional().isIn(ALL_CHANGE_REQUEST_ACTIONS),
  query('submittedBy').optional().isMongoId().withMessage('Invalid submittedBy id'),
  query('sortBy').optional().isIn(CHANGE_REQUEST_SORT_FIELDS),
  query('sortOrder').optional().isIn(['asc', 'desc']),
];

const auditQueryRules = [
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
  query('search').optional().trim(),
  query('stockCode').optional().trim(),
  query('userId').optional().isMongoId().withMessage('Invalid user id'),
  query('decision').optional().isIn(ALL_AUDIT_DECISIONS),
  query('status').optional().isIn(ALL_AUDIT_DECISIONS),
  query('dateFrom').optional().isISO8601().withMessage('dateFrom must be a valid date'),
  query('dateTo').optional().isISO8601().withMessage('dateTo must be a valid date'),
  query('sortBy').optional().isIn(AUDIT_SORT_FIELDS),
  query('sortOrder').optional().isIn(['asc', 'desc']),
];

const notificationIdRules = [
  param('id').isMongoId().withMessage('Invalid notification id'),
];

/** Reuse Hardware create validation for submit-create. */
const submitCreateRules = hardwareCreateRules;

/** Reuse Hardware update validation for submit-update (includes :id param). */
const submitUpdateRules = hardwareUpdateRules;

module.exports = {
  idParamRules,
  rejectRules,
  listQueryRules,
  auditQueryRules,
  notificationIdRules,
  submitCreateRules,
  submitUpdateRules,
};
