const sendResponse = require('../utils/apiResponse');
const { HTTP_STATUS } = require('../config/constants');

const errorHandler = (err, req, res, next) => {
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
