const { body } = require('express-validator');
const { ALL_ROLES } = require('../config/constants');

const loginRules = [
  body('email').trim().isEmail().withMessage('A valid email is required'),
  body('password').notEmpty().withMessage('Password is required'),
];

const registerRules = [
  body('name').trim().notEmpty().withMessage('Name is required'),
  body('email').trim().isEmail().withMessage('A valid email is required'),
  body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
  body('role').optional().isIn(ALL_ROLES).withMessage('Invalid role'),
];

module.exports = {
  loginRules,
  registerRules,
};
