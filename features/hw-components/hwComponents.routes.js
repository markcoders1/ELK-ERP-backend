const express = require('express');
const hwComponentsController = require('./hwComponents.controller');
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
  itemCodeParamRules,
  listQueryRules,
} = require('./hwComponents.validator');

const router = express.Router();

router.use(authenticate);

router.get('/', validate(listQueryRules), hwComponentsController.list);

router.get(
  '/by-product/:productCode',
  validate(productCodeParamRules),
  hwComponentsController.listByProductCode
);

router.post(
  '/recalculate/:itemCode',
  authorizeRoles(...HARDWARE_WRITE_ROLES),
  validate(itemCodeParamRules),
  hwComponentsController.recalculate
);

router.get('/:id', validate(idParamRules), hwComponentsController.getById);

router.post(
  '/',
  authorizeRoles(...HARDWARE_WRITE_ROLES),
  validate(createRules),
  hwComponentsController.create
);

router.patch(
  '/:id',
  authorizeRoles(...HARDWARE_WRITE_ROLES),
  validate(updateRules),
  hwComponentsController.update
);

router.delete(
  '/:id',
  authorizeRoles(ROLES.ADMINISTRATOR),
  validate(idParamRules),
  hwComponentsController.remove
);

module.exports = router;
