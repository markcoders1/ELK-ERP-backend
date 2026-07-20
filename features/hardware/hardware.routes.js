const express = require('express');
const hardwareController = require('./hardware.controller');
const authenticate = require('../auth/auth.middleware');
const authorizeRoles = require('../../middlewares/role');
const validate = require('../../middlewares/validate');
const {
  ROLES,
  HARDWARE_WRITE_ROLES,
  APPROVAL_SUBMIT_ROLES,
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

router.post(
  '/submit-create',
  authorizeRoles(...APPROVAL_SUBMIT_ROLES),
  validate(createRules),
  hardwareController.submitCreate
);

router.post(
  '/:id/submit-update',
  authorizeRoles(...APPROVAL_SUBMIT_ROLES),
  validate(updateRules),
  hardwareController.submitUpdate
);

router.get('/:id', validate(idParamRules), hardwareController.getById);

/** Existing POST/PATCH paths now submit pending approval requests (catalogue unchanged until approve). */
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
