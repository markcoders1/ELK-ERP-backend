const express = require('express');
const componentController = require('./component.controller');
const authenticate = require('../auth/auth.middleware');
const authorizeRoles = require('../../middlewares/role');
const validate = require('../../middlewares/validate');
const {
  ROLES,
  COMPONENT_WRITE_ROLES,
  APPROVAL_SUBMIT_ROLES,
} = require('../../config/constants');
const {
  createRules,
  updateRules,
  sectionUpdateRules,
  idParamRules,
  sectionParamRules,
  listQueryRules,
} = require('./component.validator');

const router = express.Router();

router.use(authenticate);

router.get('/', validate(listQueryRules), componentController.list);

router.post(
  '/submit-create',
  authorizeRoles(...APPROVAL_SUBMIT_ROLES),
  validate(createRules),
  componentController.submitCreate
);

router.post(
  '/',
  authorizeRoles(...COMPONENT_WRITE_ROLES),
  validate(createRules),
  componentController.create
);

router.get('/:id/sections', validate(idParamRules), componentController.listSections);

router.get(
  '/:id/sections/:sectionId/items',
  validate(sectionParamRules),
  componentController.listSectionItems
);

router.get('/:id/versions', validate(idParamRules), componentController.listVersions);

router.post(
  '/:id/submit-update',
  authorizeRoles(...APPROVAL_SUBMIT_ROLES),
  validate(updateRules),
  componentController.submitUpdate
);

router.patch(
  '/:id/sections/:sectionType',
  authorizeRoles(...COMPONENT_WRITE_ROLES),
  validate(sectionUpdateRules),
  componentController.updateSection
);

router.get('/:id', validate(idParamRules), componentController.getById);

router.patch(
  '/:id',
  authorizeRoles(...COMPONENT_WRITE_ROLES),
  validate(updateRules),
  componentController.update
);

router.delete(
  '/:id',
  authorizeRoles(ROLES.ADMINISTRATOR),
  validate(idParamRules),
  componentController.remove
);

module.exports = router;
