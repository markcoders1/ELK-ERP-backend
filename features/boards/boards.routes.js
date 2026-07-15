const express = require('express');
const boardsController = require('./boards.controller');
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
} = require('./boards.validator');

const router = express.Router();

router.use(authenticate);

router.get('/', validate(listQueryRules), boardsController.list);
router.get('/:id', validate(idParamRules), boardsController.getById);

router.post(
  '/',
  authorizeRoles(...HARDWARE_WRITE_ROLES),
  validate(createRules),
  boardsController.create
);

router.patch(
  '/:id',
  authorizeRoles(...HARDWARE_WRITE_ROLES),
  validate(updateRules),
  boardsController.update
);

router.delete(
  '/:id',
  authorizeRoles(ROLES.ADMINISTRATOR),
  validate(idParamRules),
  boardsController.remove
);

module.exports = router;
