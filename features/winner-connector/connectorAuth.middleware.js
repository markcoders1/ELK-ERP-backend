const bcrypt = require('bcrypt');
const Connector = require('./connector.model');
const AppError = require('../../utils/AppError');
const asyncHandler = require('../../utils/asyncHandler');
const { HTTP_STATUS } = require('../../config/constants');

/**
 * Authenticate Winner Desktop Connector via Bearer token.
 * Does not use web-app cookie JWT sessions.
 */
const authenticateConnector = asyncHandler(async (req, res, next) => {
  const header = req.headers.authorization || '';
  const match = header.match(/^Bearer\s+(.+)$/i);

  if (!match) {
    throw new AppError('Connector authentication required', HTTP_STATUS.UNAUTHORIZED);
  }

  const token = match[1].trim();
  if (!token) {
    throw new AppError('Connector authentication required', HTTP_STATUS.UNAUTHORIZED);
  }

  const connectorId = String(req.body?.connectorId || '').trim();
  if (!connectorId) {
    throw new AppError('connectorId is required', HTTP_STATUS.BAD_REQUEST);
  }

  const connector = await Connector.findOne({ connectorId })
    .select('+tokenHash name isActive connectorId')
    .lean();

  if (!connector || !connector.isActive) {
    throw new AppError('Invalid or inactive connector', HTTP_STATUS.UNAUTHORIZED);
  }

  const valid = await bcrypt.compare(token, connector.tokenHash);
  if (!valid) {
    throw new AppError('Invalid or inactive connector', HTTP_STATUS.UNAUTHORIZED);
  }

  req.connector = {
    id: connector._id.toString(),
    connectorId: connector.connectorId,
    name: connector.name,
  };

  next();
});

module.exports = authenticateConnector;
