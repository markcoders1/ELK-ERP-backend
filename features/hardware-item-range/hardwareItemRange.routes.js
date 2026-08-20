const express = require('express');
const hardwareItemRangeController = require('./hardwareItemRange.controller');
const authenticate = require('../auth/auth.middleware');
const validate = require('../../middlewares/validate');
const {
  listQueryRules,
  itemCodeParamRules,
} = require('./hardwareItemRange.validator');

const router = express.Router();

router.use(authenticate);

router.get('/', validate(listQueryRules), hardwareItemRangeController.list);
router.get(
  '/:itemCode',
  validate(itemCodeParamRules),
  hardwareItemRangeController.getByItemCode
);

module.exports = router;
