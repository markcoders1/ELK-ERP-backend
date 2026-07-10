const sendResponse = require('../utils/apiResponse');
const { HTTP_STATUS } = require('../config/constants');

const errorHandler = (err, req, res, next) => {
  if (err.name === 'CastError') {
    return sendResponse(res, {
      success: false,
      message: 'Invalid identifier',
      statusCode: HTTP_STATUS.BAD_REQUEST,
    });
  }

  if (err.code === 11000) {
    return sendResponse(res, {
      success: false,
      message: 'A record with this unique value already exists',
      statusCode: HTTP_STATUS.CONFLICT,
    });
  }

  const statusCode = err.statusCode || HTTP_STATUS.INTERNAL_SERVER_ERROR;
  const message = err.message || 'Internal server error';

  if (process.env.NODE_ENV !== 'production') {
    console.error(err);
  }

  return sendResponse(res, {
    success: false,
    message,
    errors: err.errors || null,
    statusCode,
  });
};

module.exports = errorHandler;
