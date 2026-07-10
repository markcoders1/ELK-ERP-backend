const jwt = require('jsonwebtoken');
const User = require('../models/User');
const AppError = require('../utils/AppError');
const asyncHandler = require('../utils/asyncHandler');
const env = require('../config/env');
const { HTTP_STATUS } = require('../config/constants');

const authenticate = asyncHandler(async (req, res, next) => {
  const token = req.cookies?.[env.cookieName];

  if (!token) {
    throw new AppError('Authentication required', HTTP_STATUS.UNAUTHORIZED);
  }

  let decoded;

  try {
    decoded = jwt.verify(token, env.jwtSecret);
  } catch {
    throw new AppError('Invalid or expired session', HTTP_STATUS.UNAUTHORIZED);
  }

  const user = await User.findById(decoded.userId).select('name email role isActive').lean();

  if (!user || !user.isActive) {
    throw new AppError('User not found or inactive', HTTP_STATUS.UNAUTHORIZED);
  }

  req.user = {
    id: user._id.toString(),
    name: user.name,
    email: user.email,
    role: user.role,
  };

  next();
});

module.exports = authenticate;
