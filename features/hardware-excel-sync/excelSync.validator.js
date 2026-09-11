const { body } = require('express-validator');
const { ALL_PRICING_BASIS, PRICING_BASIS } = require('../../config/constants');
const env = require('../../config/env');

const sourceRules = [
  body('rows.*.source.groupCode')
    .optional({ values: 'null' })
    .isString()
    .trim()
    .notEmpty()
    .withMessage('groupCode cannot be empty when provided'),
  body('rows.*.source.description')
    .optional({ values: 'null' })
    .isString()
    .trim()
    .notEmpty()
    .withMessage('description cannot be empty when provided'),
  body('rows.*.source.pricingBasis')
    .optional({ values: 'null' })
    .isIn(ALL_PRICING_BASIS)
    .withMessage(`pricingBasis must be one of: ${ALL_PRICING_BASIS.join(', ')}`),
  body('rows.*.source.mnfMarkup')
    .optional({ values: 'null' })
    .isFloat({ gt: 0 })
    .withMessage('mnfMarkup must be a positive decimal value'),
  body('rows.*.source.frcMarkup')
    .optional({ values: 'null' })
    .isFloat({ gt: 0 })
    .withMessage('frcMarkup must be a positive decimal value'),
  body('rows.*.source.retailMarkup')
    .optional({ values: 'null' })
    .custom((value, { req, path }) => {
      if (value === null || value === undefined || value === '') return true;
      const number = Number(value);
      if (!Number.isFinite(number) || number <= 0) {
        throw new Error('retailMarkup must be a positive decimal value');
      }
      return true;
    }),
  body('rows.*.source.retFromSupplier')
    .optional({ values: 'null' })
    .isFloat({ min: 0 })
    .withMessage('retFromSupplier must be >= 0'),
  body('rows.*.source.regionalCosts.cpt')
    .optional({ values: 'null' })
    .isFloat({ min: 0 })
    .withMessage('cpt must be >= 0'),
  body('rows.*.source.regionalCosts.jhb')
    .optional({ values: 'null' })
    .isFloat({ min: 0 })
    .withMessage('jhb must be >= 0'),
  body('rows.*.source.weight')
    .optional({ values: 'null' })
    .isFloat({ min: 0 })
    .withMessage('weight must be >= 0'),
];

const submitRules = [
  body('workbook').optional().isObject(),
  body('workbook.sheetName')
    .optional()
    .isString()
    .custom((value) => {
      if (value && String(value).trim() !== 'Master File') {
        throw new Error('workbook.sheetName must be "Master File"');
      }
      return true;
    }),
  body('rows')
    .isArray({ min: 1 })
    .withMessage('rows must be a non-empty array'),
  body('rows').custom((rows) => {
    const max = env.hardwareExcelSyncMaxRows || 100;
    if (!Array.isArray(rows)) return true;
    if (rows.length > max) {
      throw new Error(`rows exceeds maximum batch size of ${max}`);
    }
    return true;
  }),
  body('rows.*.stockCode')
    .trim()
    .notEmpty()
    .withMessage('stockCode is required for each row'),
  body('rows.*.source')
    .isObject()
    .withMessage('source object is required for each row'),
  body('rows.*.verification')
    .optional({ values: 'null' })
    .isObject()
    .withMessage('verification must be an object when provided'),
  body('rows.*.excelRowNumber')
    .optional({ values: 'null' })
    .isInt({ min: 1 })
    .withMessage('excelRowNumber must be a positive integer'),
  body('rows.*.source.stockCode')
    .not()
    .exists()
    .withMessage('source.stockCode must not be sent (stock code is identity only)'),
  ...sourceRules,
  // Retail retFromSupplier required — same as manual update
  body('rows').custom((rows) => {
    if (!Array.isArray(rows)) return true;
    rows.forEach((row, index) => {
      const basis = row?.source?.pricingBasis;
      if (basis !== PRICING_BASIS.RETAIL) return;
      const ret = row?.source?.retFromSupplier;
      if (ret === '' || ret === null || ret === undefined) {
        throw new Error(
          `rows[${index}]: RET from Supplier is required when pricing basis is Retail`
        );
      }
    });
    return true;
  }),
];

module.exports = {
  submitRules,
};
