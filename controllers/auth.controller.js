const authService = require('../services/auth.service');
const sendResponse = require('../utils/apiResponse');
const asyncHandler = require('../utils/asyncHandler');
const env = require('../config/env');
const { HTTP_STATUS } = require('../config/constants');

const setAuthCookie = (res, token) => {
  res.cookie(env.cookieName, token, authService.getCookieOptions());
};

const clearAuthCookie = (res) => {
  res.clearCookie(env.cookieName, authService.getCookieOptions());
};

const login = asyncHandler(async (req, res) => {
  const { token, user } = await authService.login(req.body);

  setAuthCookie(res, token);

  return sendResponse(res, {
    message: 'Login successful',
    data: { user },
    statusCode: HTTP_STATUS.OK,
  });
});

const register = asyncHandler(async (req, res) => {
  const { token, user } = await authService.register(req.body);

  setAuthCookie(res, token);

  return sendResponse(res, {
    message: 'Registration successful',
    data: { user },
    statusCode: HTTP_STATUS.CREATED,
  });
});

const logout = asyncHandler(async (req, res) => {
  clearAuthCookie(res);

  return sendResponse(res, {
    message: 'Logout successful',
    statusCode: HTTP_STATUS.OK,
  });
});

const getMe = asyncHandler(async (req, res) => {
  const user = await authService.getProfile(req.user.id);

  return sendResponse(res, {
    message: 'Profile fetched successfully',
    data: { user },
    statusCode: HTTP_STATUS.OK,
  });
});

module.exports = {
  login,
  register,
  logout,
  getMe,
};
