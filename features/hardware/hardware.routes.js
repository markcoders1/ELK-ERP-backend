const express = require('express');
const hardwareController = require('./hardware.controller');
const authenticate = require('../auth/auth.middleware');
const authorizeRoles = require('../../middlewares/role');
const validate = require('../../middlewares/validate');
const {
  ROLES,
  HARDWARE_WRITE_ROLES,
} = require('../../config/constants');
const {
  createRules,
  updateRules,
  idParamRules,
  listQueryRules,
} = require('./hardware.validator');

const router = express.Router();

router.use(authenticate);

router.get('/', validate(listQueryRules), hardwareController.list);
router.get('/:id', validate(idParamRules), hardwareController.getById);

router.post(
  '/',
  authorizeRoles(...HARDWARE_WRITE_ROLES),
  validate(createRules),
  hardwareController.create
);

router.patch(
  '/:id',
  authorizeRoles(...HARDWARE_WRITE_ROLES),
  validate(updateRules),
  hardwareController.update
);

router.delete(
  '/:id',
  authorizeRoles(ROLES.ADMINISTRATOR),
  validate(idParamRules),
  hardwareController.remove
);

module.exports = router;
