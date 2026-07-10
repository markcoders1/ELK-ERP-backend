const { validationResult } = require('express-validator');
const AppError = require('../utils/AppError');
const { HTTP_STATUS } = require('../config/constants');

const validate = (rules) => [
  ...rules,
  (req, res, next) => {
    const errors = validationResult(req);

    if (!errors.isEmpty()) {
      return next(
        new AppError('Validation failed', HTTP_STATUS.BAD_REQUEST, errors.array())
      );
    }

    return next();
  },
];

module.exports = validate;
