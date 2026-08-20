const { param, query } = require('express-validator');

const SORT_FIELDS = [
  'itemCode',
  'groupCode',
  'description',
  'manufacturingPrice',
  'createdAt',
  'updatedAt',
];

const listQueryRules = [
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
  query('search').optional().trim(),
  query('groupCode').optional().trim(),
  query('isActive').optional().isIn(['true', 'false']),
  query('sortBy').optional().isIn(SORT_FIELDS),
  query('sortOrder').optional().isIn(['asc', 'desc']),
];

const itemCodeParamRules = [
  param('itemCode').trim().notEmpty().withMessage('Item code is required'),
];

module.exports = {
  listQueryRules,
  itemCodeParamRules,
};
