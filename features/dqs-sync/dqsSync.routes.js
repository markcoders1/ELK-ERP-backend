const express = require('express');
const dqsSyncController = require('./dqsSync.controller');
const authenticate = require('../auth/auth.middleware');
const authorizeRoles = require('../../middlewares/role');
const { ROLES } = require('../../config/constants');

const router = express.Router();

router.use(authenticate);
router.use(authorizeRoles(ROLES.ADMINISTRATOR));

router.get('/status', dqsSyncController.getStatus);
router.post('/snapshot', dqsSyncController.pushSnapshot);

module.exports = router;
