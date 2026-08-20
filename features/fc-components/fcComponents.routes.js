const express = require('express');
const fcComponentsController = require('./fcComponents.controller');
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
  productCodeParamRules,
  listQueryRules,
} = require('./fcComponents.validator');

const router = express.Router();

router.use(authenticate);

router.get('/', validate(listQueryRules), fcComponentsController.list);

router.get(
  '/by-product/:productCode',
  validate(productCodeParamRules),
  fcComponentsController.listByProductCode
);

router.get('/:id', validate(idParamRules), fcComponentsController.getById);

router.post(
  '/',
  authorizeRoles(...HARDWARE_WRITE_ROLES),
  validate(createRules),
  fcComponentsController.create
);

router.patch(
  '/:id',
  authorizeRoles(...HARDWARE_WRITE_ROLES),
  validate(updateRules),
  fcComponentsController.update
);

router.delete(
  '/:id',
  authorizeRoles(ROLES.ADMINISTRATOR),
  validate(idParamRules),
  fcComponentsController.remove
);

module.exports = router;
