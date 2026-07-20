const express = require('express');
const usersController = require('./users.controller');
const authenticate = require('../auth/auth.middleware');
const authorizeRoles = require('../../middlewares/role');
const validate = require('../../middlewares/validate');
const { ROLES } = require('../../config/constants');
const {
  createRules,
  updateRules,
  idParamRules,
  listQueryRules,
} = require('./users.validator');

const router = express.Router();

router.use(authenticate);
router.use(authorizeRoles(ROLES.ADMINISTRATOR));

router.get('/summary', usersController.summary);

router.get('/', validate(listQueryRules), usersController.list);

router.post('/', validate(createRules), usersController.create);

router.get('/:id', validate(idParamRules), usersController.getById);

router.patch('/:id', validate(updateRules), usersController.update);

router.patch(
  '/:id/reset-password',
  validate(idParamRules),
  usersController.resetPassword
);

module.exports = router;
