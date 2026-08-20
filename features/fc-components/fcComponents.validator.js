const { body, param, query } = require('express-validator');

const SORT_FIELDS = [
  'productCode',
  'component',
  'range',
  'category',
  'quantity',
  'boardM2',
  'createdAt',
  'updatedAt',
];

const createRules = [
  body('productCode').trim().notEmpty().withMessage('Product code is required'),
  body('component').trim().notEmpty().withMessage('Component is required'),
  body('quantity').optional().isFloat({ min: 0 }),
  body('length').optional().isFloat({ min: 0 }),
  body('width').optional().isFloat({ min: 0 }),
  body('edging').optional().trim(),
  body('range').optional().trim(),
  body('category').optional().trim(),
  body('childPartCode').optional().trim(),
  body('childPartDescription').optional().trim(),
  body('type').optional().trim(),
  body('note').optional().trim(),
  body('checkInHw').optional().trim(),
  body('checkInCatalogue').optional().trim(),
  body('match').optional().trim(),
];

const updateRules = [
  param('id').isMongoId().withMessage('Invalid id'),
  body('productCode').optional().trim().notEmpty(),
  body('component').optional().trim().notEmpty(),
  body('quantity').optional().isFloat({ min: 0 }),
  body('length').optional().isFloat({ min: 0 }),
  body('width').optional().isFloat({ min: 0 }),
  body('edging').optional().trim(),
  body('range').optional().trim(),
  body('category').optional().trim(),
  body('childPartCode').optional().trim(),
  body('childPartDescription').optional().trim(),
  body('type').optional().trim(),
  body('note').optional().trim(),
  body('checkInHw').optional().trim(),
  body('checkInCatalogue').optional().trim(),
  body('match').optional().trim(),
];

const idParamRules = [param('id').isMongoId().withMessage('Invalid id')];

const productCodeParamRules = [
  param('productCode').trim().notEmpty().withMessage('Product code is required'),
];

const listQueryRules = [
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 100 }),
  query('search').optional().trim(),
  query('productCode').optional().trim(),
  query('component').optional().trim(),
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
  listQueryRules,
};
