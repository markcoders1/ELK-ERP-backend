const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const User = require('./user.model');
const AppError = require('../../utils/AppError');
const env = require('../../config/env');
const { ROLES, HTTP_STATUS } = require('../../config/constants');

const SALT_ROUNDS = 12;

const signToken = (userId) => jwt.sign({ userId }, env.jwtSecret, { expiresIn: env.jwtExpiresIn });

const getCookieOptions = () => ({
  httpOnly: true,
  secure: env.nodeEnv === 'production',
  sameSite: env.nodeEnv === 'production' ? 'none' : 'lax',
  maxAge: 7 * 24 * 60 * 60 * 1000,
});

const login = async ({ email, password }) => {
  const user = await User.findOne({ email }).select('+password');

  if (!user || !user.isActive) {
    throw new AppError('Invalid email or password', HTTP_STATUS.UNAUTHORIZED);
  }

  const isPasswordValid = await bcrypt.compare(password, user.password);

  if (!isPasswordValid) {
    throw new AppError('Invalid email or password', HTTP_STATUS.UNAUTHORIZED);
  }

  user.lastLogin = new Date();
  await user.save();

  const token = signToken(user._id);

  return {
    token,
    user: user.toSafeObject(),
  };
};

const register = async ({ name, email, password, role = ROLES.DATA_ENTRY }) => {
  const existingUser = await User.findOne({ email }).lean();

  if (existingUser) {
    throw new AppError('Email is already registered', HTTP_STATUS.CONFLICT);
  }

  const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);

  const user = await User.create({
    name,
    email,
    password: hashedPassword,
    role,
  });

  const token = signToken(user._id);

  return {
    token,
    user: user.toSafeObject(),
  };
};

const getProfile = async (userId) => {
  const user = await User.findById(userId).lean();

  if (!user || !user.isActive) {
    throw new AppError('User not found', HTTP_STATUS.NOT_FOUND);
  }

  return User.toSafeObjectFromLean(user);
};

module.exports = {
  login,
  register,
  getProfile,
  getCookieOptions,
};
