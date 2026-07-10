const sendResponse = (res, { success = true, message = '', data = null, errors = null, statusCode = 200 }) => {
  return res.status(statusCode).json({
    success,
    message,
    data,
    errors,
  });
};

module.exports = sendResponse;
