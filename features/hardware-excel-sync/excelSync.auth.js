const bcrypt = require('bcrypt');
const crypto = require('crypto');
const User = require('../auth/user.model');
const env = require('../../config/env');
const AppError = require('../../utils/AppError');
const asyncHandler = require('../../utils/asyncHandler');
const {
  HTTP_STATUS,
  HARDWARE_WRITE_ROLES,
} = require('../../config/constants');

/**
 * Excel Sync auth: Bearer token (not cookie JWT).
 * Maps to a configured application user for submittedBy / role checks.
 *
 * Config:
 *   HARDWARE_EXCEL_SYNC_TOKEN_HASH  — bcrypt hash of the bearer token (preferred)
 *   HARDWARE_EXCEL_SYNC_TOKEN       — plain token (local/dev only)
 *   HARDWARE_EXCEL_SYNC_USER_ID     — Mongo User _id (must be active write role)
 */
const timingSafeEqualString = (a, b) => {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
};

const verifySyncToken = async (token) => {
  if (env.hardwareExcelSyncTokenHash) {
    return bcrypt.compare(token, env.hardwareExcelSyncTokenHash);
  }

  if (env.hardwareExcelSyncToken) {
    return timingSafeEqualString(token, env.hardwareExcelSyncToken);
  }

  return false;
};

const authenticateExcelSync = asyncHandler(async (req, res, next) => {
  if (!env.hardwareExcelSyncUserId) {
    throw new AppError(
      'Excel Sync is not configured (HARDWARE_EXCEL_SYNC_USER_ID)',
      HTTP_STATUS.UNAUTHORIZED
    );
  }

  if (!env.hardwareExcelSyncTokenHash && !env.hardwareExcelSyncToken) {
    throw new AppError(
      'Excel Sync is not configured (HARDWARE_EXCEL_SYNC_TOKEN_HASH or TOKEN)',
      HTTP_STATUS.UNAUTHORIZED
    );
  }

  const header = req.headers.authorization || '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match || !match[1].trim()) {
    throw new AppError('Excel Sync authentication required', HTTP_STATUS.UNAUTHORIZED);
  }

  const token = match[1].trim();
  const valid = await verifySyncToken(token);
  if (!valid) {
    throw new AppError('Invalid Excel Sync credentials', HTTP_STATUS.UNAUTHORIZED);
  }

  const user = await User.findById(env.hardwareExcelSyncUserId)
    .select('name email role isActive')
    .lean();

  if (!user || user.isActive === false) {
    throw new AppError('Excel Sync submitter user is inactive or missing', HTTP_STATUS.UNAUTHORIZED);
  }

  if (!HARDWARE_WRITE_ROLES.includes(user.role)) {
    throw new AppError(
      'Excel Sync submitter user is not permitted to submit hardware updates',
      HTTP_STATUS.FORBIDDEN
    );
  }

  req.user = {
    id: user._id.toString(),
    name: user.name,
    email: user.email,
    role: user.role,
  };

  req.excelSync = {
    authMode: 'bearer-token',
    requestId:
      req.headers['x-request-id'] ||
      req.headers['idempotency-key'] ||
      null,
  };

  next();
});

module.exports = authenticateExcelSync;
