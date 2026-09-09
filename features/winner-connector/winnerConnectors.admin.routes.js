const express = require('express');
const winnerConnectorController = require('./winnerConnector.controller');
const authenticate = require('../auth/auth.middleware');
const authorizeRoles = require('../../middlewares/role');
const { ROLES } = require('../../config/constants');

const router = express.Router();

/**
 * Admin device management for Winner Desktop Connector.
 * Mounted at /api/winner-connectors
 */
router.use(authenticate);
router.post('/', authorizeRoles(ROLES.ADMINISTRATOR), winnerConnectorController.createDevice);

module.exports = router;
