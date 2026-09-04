const express = require('express');
const winnerConnectorController = require('./winnerConnector.controller');
const authenticateConnector = require('./connectorAuth.middleware');

const router = express.Router();

/**
 * Winner Desktop Connector — Bearer token auth (not cookie JWT).
 * POST /api/integrations/winner/import
 */
router.post(
  '/import',
  winnerConnectorController.uploadMiddleware,
  authenticateConnector,
  winnerConnectorController.importWinnerAscii
);

module.exports = router;
