const { body, param, query } = require('express-validator');
const {
  COMPONENT_SORT_FIELDS,
  ALL_COMPONENT_VERSION_STATUSES,
  ALL_SECTION_TYPES,
} = require('../../config/constants');

const dimensionsRules = [
  body('dimensions.length')
    .optional({ values: 'null' })
    .isFloat({ min: 0 })
    .withMessage('Length must be >= 0'),
  body('dimensions.width')
    .optional({ values: 'null' })
    .isFloat({ min: 0 })
    .withMessage('Width must be >= 0'),
  body('dimensions.height')
    .optional({ values: 'null' })
    .isFloat({ min: 0 })
    .withMessage('Height must be >= 0'),
  body('dimensions.unit').optional().trim(),
];

const createRules = [
  body('componentCode').optional().trim().notEmpty(),
  body('header.componentCode').optional().trim().notEmpty(),
  body().custom((_, { req }) => {
    const code = req.body.componentCode || req.body.header?.componentCode;
    if (!code || !String(code).trim()) {
      throw new Error('Component code is required');
    }
    return true;
  }),
  body('description').optional().trim(),
  body('header.description').optional().trim(),
  body().custom((_, { req }) => {
    const description = req.body.description || req.body.header?.description;
    if (!description || !String(description).trim()) {
      throw new Error('Description is required');
    }
    return true;
  }),
  body('category').optional().trim(),
  body('finish').optional().trim(),
  body('status').optional().trim(),
  body('retailPrice')
    .optional({ values: 'null' })
    .isFloat({ min: 0 })
    .withMessage('Retail price must be >= 0'),
  body('header.retailPrice')
    .optional({ values: 'null' })
    .isFloat({ min: 0 })
    .withMessage('Retail price must be >= 0'),
  body('sections').optional().isArray(),
  body('sections.*.sectionType').optional().trim().notEmpty(),
  body('sections.*.items').optional().isArray(),
  body('isActive').optional().isBoolean(),
  body('comments').optional().trim(),
  ...dimensionsRules,
];

const updateRules = [
  param('id').isMongoId().withMessage('Invalid component id'),
  body('componentCode').not().exists().withMessage('Component code cannot be changed'),
  body('header.componentCode').not().exists().withMessage('Component code cannot be changed'),
  body('description').optional().trim().notEmpty(),
  body('header.description').optional().trim().notEmpty(),
  body('category').optional().trim(),
  body('finish').optional().trim(),
  body('status').optional().trim(),
  body('retailPrice')
    .optional({ values: 'null' })
    .isFloat({ min: 0 })
    .withMessage('Retail price must be >= 0'),
  body('sections').optional().isArray(),
  body('sectionType').optional().trim().notEmpty(),
  body('items').optional().isArray(),
  body('isActive').optional().isBoolean(),
  body('comments').optional().trim(),
  ...dimensionsRules,
];

const sectionUpdateRules = [
  param('id').isMongoId().withMessage('Invalid component id'),
  param('sectionType')
    .trim()
    .notEmpty()
    .withMessage('Section type is required'),
  body('items').isArray().withMessage('Items array is required'),
  body('sectionName').optional().trim(),
  body('comments').optional().trim(),
];

const idParamRules = [param('id').isMongoId().withMessage('Invalid component id')];

const sectionParamRules = [
  param('id').isMongoId().withMessage('Invalid component id'),
  param('sectionId').isMongoId().withMessage('Invalid section id'),
];

const listQueryRules = [
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 100 }),
  query('sortBy')
    .optional()
    .isIn(COMPONENT_SORT_FIELDS)
    .withMessage(`sortBy must be one of: ${COMPONENT_SORT_FIELDS.join(', ')}`),
  query('sortOrder').optional().isIn(['asc', 'desc']),
  query('search').optional().trim(),
  query('category').optional().trim(),
  query('finish').optional().trim(),
  query('status').optional().trim(),
  query('versionStatus').optional().isIn(ALL_COMPONENT_VERSION_STATUSES),
  query('approvalStatus').optional().isIn(ALL_COMPONENT_VERSION_STATUSES),
  query('createdBy').optional().isMongoId(),
  query('updatedFrom').optional().isISO8601(),
  query('updatedTo').optional().isISO8601(),
];

module.exports = {
  createRules,
  updateRules,
  sectionUpdateRules,
  idParamRules,
  sectionParamRules,
  listQueryRules,
  ALL_SECTION_TYPES,
};
