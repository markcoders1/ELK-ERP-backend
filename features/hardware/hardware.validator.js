const { body, param, query } = require('express-validator');
const {
  ALL_PRICING_BASIS,
  HARDWARE_SORT_FIELDS,
  PRICING_BASIS,
} = require('../../config/constants');

const positiveMarkupRule = (field, label) =>
  body(field)
    .optional({ values: 'null' })
    .isFloat({ gt: 0 })
    .withMessage(`${label} must be a positive decimal value`);

const regionalCostsRules = [
  body('regionalCosts.cpt')
    .optional({ values: 'null' })
    .isFloat({ min: 0 })
    .withMessage('CPT cost must be a number greater than or equal to 0'),
  body('regionalCosts.jhb')
    .optional({ values: 'null' })
    .isFloat({ min: 0 })
    .withMessage('JHB cost must be a number greater than or equal to 0'),
  // Agreed is calculated; accept optionally for backward-compatible payloads.
  body('regionalCosts.agreed')
    .optional({ values: 'null' })
    .isFloat({ min: 0 })
    .withMessage('Agreed cost must be a number greater than or equal to 0'),
];

const retFromSupplierRules = [
  body('retFromSupplier')
    .optional({ values: 'null' })
    .isFloat({ min: 0 })
    .withMessage('RET from Supplier must be a number greater than or equal to 0'),
  body('retFromSupplier').custom((value, { req }) => {
    if (req.body?.pricingBasis !== PRICING_BASIS.RETAIL) return true;
    if (value === '' || value === null || value === undefined) {
      throw new Error('RET from Supplier is required when pricing basis is Retail');
    }
    return true;
  }),
];

const markupAndWeightRules = [
  positiveMarkupRule('mnfMarkup', 'MNF markup'),
  positiveMarkupRule('frcMarkup', 'FRC markup'),
  positiveMarkupRule('retailMarkup', 'Retail markup'),
  body('weight')
    .optional({ values: 'null' })
    .isFloat({ min: 0 })
    .withMessage('Weight must be a number greater than or equal to 0'),
];

const createRules = [
  body('groupCode').trim().notEmpty().withMessage('Group code is required'),
  body('stockCode').trim().notEmpty().withMessage('Stock code is required'),
  body('description').trim().notEmpty().withMessage('Description is required'),
  body('supplierName').optional().trim(),
  body('supplierCode').optional().trim(),
  body('regionalCosts').isObject().withMessage('Regional costs are required'),
  body('pricingBasis')
    .isIn(ALL_PRICING_BASIS)
    .withMessage(`Pricing basis must be one of: ${ALL_PRICING_BASIS.join(', ')}`),
  body('isImport').optional().isBoolean().withMessage('isImport must be a boolean'),
  body('isActive').optional().isBoolean().withMessage('isActive must be a boolean'),
  ...regionalCostsRules,
  ...markupAndWeightRules,
  ...retFromSupplierRules,
];

const forbiddenOnUpdateRules = [
  body('stockCode').not().exists().withMessage('Stock code cannot be changed'),
  body('createdBy').not().exists().withMessage('createdBy cannot be modified'),
  body('createdAt').not().exists().withMessage('createdAt cannot be modified'),
  body('updatedAt').not().exists().withMessage('updatedAt cannot be modified'),
  body('updatedBy').not().exists().withMessage('updatedBy cannot be modified'),
  body('deletedAt').not().exists().withMessage('deletedAt cannot be modified'),
];

const updateRules = [
  param('id').isMongoId().withMessage('Invalid hardware item id'),
  ...forbiddenOnUpdateRules,
  body('groupCode').optional().trim().notEmpty().withMessage('Group code cannot be empty'),
  body('description').optional().trim().notEmpty().withMessage('Description cannot be empty'),
  body('supplierName').optional().trim(),
  body('supplierCode').optional().trim(),
  body('pricingBasis')
    .optional()
    .isIn(ALL_PRICING_BASIS)
    .withMessage(`Pricing basis must be one of: ${ALL_PRICING_BASIS.join(', ')}`),
  body('isImport').optional().isBoolean().withMessage('isImport must be a boolean'),
  body('isActive').optional().isBoolean().withMessage('isActive must be a boolean'),
  body('regionalCosts.cpt')
    .optional({ values: 'null' })
    .isFloat({ min: 0 })
    .withMessage('CPT cost must be a number greater than or equal to 0'),
  body('regionalCosts.jhb')
    .optional({ values: 'null' })
    .isFloat({ min: 0 })
    .withMessage('JHB cost must be a number greater than or equal to 0'),
  body('regionalCosts.agreed')
    .optional({ values: 'null' })
    .isFloat({ min: 0 })
    .withMessage('Agreed cost must be a number greater than or equal to 0'),
  ...markupAndWeightRules,
  ...retFromSupplierRules,
];

const idParamRules = [param('id').isMongoId().withMessage('Invalid hardware item id')];

const listQueryRules = [
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
  query('search').optional().trim(),
  query('groupCode').optional().trim(),
  query('supplierName').optional().trim(),
  query('pricingBasis').optional().isIn(ALL_PRICING_BASIS),
  query('isActive').optional().isIn(['true', 'false']),
  query('isImport').optional().isIn(['true', 'false']),
  query('sortBy').optional().isIn(HARDWARE_SORT_FIELDS),
  query('sortOrder').optional().isIn(['asc', 'desc']),
];

module.exports = {
  createRules,
  updateRules,
  idParamRules,
  listQueryRules,
};
