const AppError = require('../utils/AppError');
const { HTTP_STATUS } = require('../config/constants');

const authorizeRoles = (...allowedRoles) => (req, res, next) => {
  if (!req.user) {
    return next(new AppError('Authentication required', HTTP_STATUS.UNAUTHORIZED));
  }

  if (!allowedRoles.includes(req.user.role)) {
    return next(new AppError('You do not have permission to perform this action', HTTP_STATUS.FORBIDDEN));
  }

  return next();
};

module.exports = authorizeRoles;
