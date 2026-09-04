const express = require('express');
const winnerConnectorController = require('./winnerConnector.controller');
const authenticate = require('../auth/auth.middleware');

const router = express.Router();

/**
 * Web UI — Winner Imports history (cookie JWT session).
 * Mounted at /api/winner-imports
 */
router.use(authenticate);

router.get('/', winnerConnectorController.listImports);
router.get('/:id', winnerConnectorController.getImport);
router.get('/:id/ascii', winnerConnectorController.downloadAscii);

module.exports = router;
