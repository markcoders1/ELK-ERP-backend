const { body, param, query } = require('express-validator');
const { BOARDS_SORT_FIELDS } = require('../../config/constants');

const dimensionRule = (field, label) =>
  body(field)
    .optional({ values: 'null' })
    .isFloat({ min: 0 })
    .withMessage(`${label} must be a number greater than or equal to 0`);

const createRules = [
  body('boardCode').trim().notEmpty().withMessage('Board code is required'),
  body('description').trim().notEmpty().withMessage('Description is required'),
  body('supplier').optional().trim(),
  body('range').optional().trim(),
  body('colour').optional().trim(),
  body('finish').optional().trim(),
  body('boardType').optional().trim(),
  dimensionRule('height', 'Height'),
  dimensionRule('width', 'Width'),
  dimensionRule('thickness', 'Thickness'),
  body('isActive').optional().isBoolean().withMessage('isActive must be a boolean'),
];

const forbiddenOnUpdateRules = [
  body('boardCode').not().exists().withMessage('Board code cannot be changed'),
  body('createdBy').not().exists().withMessage('createdBy cannot be modified'),
  body('createdAt').not().exists().withMessage('createdAt cannot be modified'),
  body('updatedAt').not().exists().withMessage('updatedAt cannot be modified'),
  body('updatedBy').not().exists().withMessage('updatedBy cannot be modified'),
  body('deletedAt').not().exists().withMessage('deletedAt cannot be modified'),
];

const updateRules = [
  param('id').isMongoId().withMessage('Invalid board id'),
  ...forbiddenOnUpdateRules,
  body('description').optional().trim().notEmpty().withMessage('Description cannot be empty'),
  body('supplier').optional().trim(),
  body('range').optional().trim(),
  body('colour').optional().trim(),
  body('finish').optional().trim(),
  body('boardType').optional().trim(),
  dimensionRule('height', 'Height'),
  dimensionRule('width', 'Width'),
  dimensionRule('thickness', 'Thickness'),
  body('isActive').optional().isBoolean().withMessage('isActive must be a boolean'),
];

const idParamRules = [param('id').isMongoId().withMessage('Invalid board id')];

const listQueryRules = [
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
  query('search').optional().trim(),
  query('supplier').optional().trim(),
  query('range').optional().trim(),
  query('colour').optional().trim(),
  query('finish').optional().trim(),
  query('boardType').optional().trim(),
  query('isActive').optional().isIn(['true', 'false']),
  query('sortBy').optional().isIn(BOARDS_SORT_FIELDS),
  query('sortOrder').optional().isIn(['asc', 'desc']),
];

module.exports = {
  createRules,
  updateRules,
  idParamRules,
  listQueryRules,
};
