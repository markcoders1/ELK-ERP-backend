const { body, param, query } = require('express-validator');
const { ALL_ROLES, USER_SORT_FIELDS } = require('../../config/constants');

const createRules = [
  body('firstName').trim().notEmpty().withMessage('First name is required'),
  body('lastName').trim().notEmpty().withMessage('Last name is required'),
  body('email').trim().isEmail().withMessage('A valid email is required'),
  body('phone').optional({ values: 'null' }).trim(),
  body('password')
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters'),
  body('role').isIn(ALL_ROLES).withMessage(`Role must be one of: ${ALL_ROLES.join(', ')}`),
  body('isActive').optional().isBoolean().withMessage('isActive must be a boolean'),
];

const forbiddenOnUpdateRules = [
  body('email').not().exists().withMessage('Email cannot be changed'),
  body('password').not().exists().withMessage('Password cannot be changed via update'),
  body('createdBy').not().exists().withMessage('createdBy cannot be modified'),
  body('createdAt').not().exists().withMessage('createdAt cannot be modified'),
  body('updatedAt').not().exists().withMessage('updatedAt cannot be modified'),
  body('lastLogin').not().exists().withMessage('lastLogin cannot be modified'),
];

const updateRules = [
  param('id').isMongoId().withMessage('Invalid user id'),
  ...forbiddenOnUpdateRules,
  body('firstName').optional().trim().notEmpty().withMessage('First name cannot be empty'),
  body('lastName').optional().trim().notEmpty().withMessage('Last name cannot be empty'),
  body('phone').optional({ values: 'null' }).trim(),
  body('role')
    .optional()
    .isIn(ALL_ROLES)
    .withMessage(`Role must be one of: ${ALL_ROLES.join(', ')}`),
  body('isActive').optional().isBoolean().withMessage('isActive must be a boolean'),
];

const idParamRules = [param('id').isMongoId().withMessage('Invalid user id')];

const listQueryRules = [
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
  query('search').optional().trim(),
  query('role').optional().isIn(ALL_ROLES).withMessage('Invalid role filter'),
  query('isActive').optional().isIn(['true', 'false']).withMessage('isActive must be true or false'),
  query('showInactive').optional().isIn(['true', 'false']).withMessage('showInactive must be true or false'),
  query('sortBy').optional().isIn(USER_SORT_FIELDS),
  query('sortOrder').optional().isIn(['asc', 'desc']),
];

module.exports = {
  createRules,
  updateRules,
  idParamRules,
  listQueryRules,
};
