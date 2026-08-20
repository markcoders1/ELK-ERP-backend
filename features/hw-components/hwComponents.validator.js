const { body, param, query } = require('express-validator');

const SORT_FIELDS = [
  'productCode',
  'hardwareItem',
  'range',
  'category',
  'quantity',
  'totalCost',
  'createdAt',
  'updatedAt',
];

const createRules = [
  body('productCode').trim().notEmpty().withMessage('Product code is required'),
  body('hardwareItem').trim().notEmpty().withMessage('Hardware item is required'),
  body('quantity').optional().isFloat({ min: 0 }),
  body('itemCount').optional({ values: 'null' }).isFloat({ min: 0 }),
  body('costPrice').optional({ values: 'null' }).isFloat({ min: 0 }),
  body('range').optional().trim(),
  body('category').optional().trim(),
  body('checkInFc').optional().trim(),
  body('checkInCatalogue').optional().trim(),
  body('matchInBoth').optional().trim(),
];

const updateRules = [
  param('id').isMongoId().withMessage('Invalid id'),
  body('productCode').optional().trim().notEmpty(),
  body('hardwareItem').optional().trim().notEmpty(),
  body('quantity').optional().isFloat({ min: 0 }),
  body('itemCount').optional({ values: 'null' }).isFloat({ min: 0 }),
  body('costPrice').optional({ values: 'null' }).isFloat({ min: 0 }),
  body('range').optional().trim(),
  body('category').optional().trim(),
  body('checkInFc').optional().trim(),
  body('checkInCatalogue').optional().trim(),
  body('matchInBoth').optional().trim(),
];

const idParamRules = [param('id').isMongoId().withMessage('Invalid id')];

const productCodeParamRules = [
  param('productCode').trim().notEmpty().withMessage('Product code is required'),
];

const itemCodeParamRules = [
  param('itemCode').trim().notEmpty().withMessage('Item code is required'),
];

const listQueryRules = [
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 100 }),
  query('search').optional().trim(),
  query('productCode').optional().trim(),
  query('hardwareItem').optional().trim(),
  query('range').optional().trim(),
  query('category').optional().trim(),
  query('sortBy').optional().isIn(SORT_FIELDS),
  query('sortOrder').optional().isIn(['asc', 'desc']),
];

module.exports = {
  createRules,
  updateRules,
  idParamRules,
  productCodeParamRules,
  itemCodeParamRules,
  listQueryRules,
};
