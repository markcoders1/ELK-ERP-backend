const express = require('express');
const uploadController = require('./upload.controller');
const authenticate = require('../auth/auth.middleware');
const authorizeRoles = require('../../middlewares/role');
const { IMPORT_ROLES } = require('../../config/constants');

const router = express.Router();

router.use(authenticate);

router.get('/dashboard-summary', uploadController.dashboardSummary);

router.get('/batches', authorizeRoles(...IMPORT_ROLES), uploadController.listBatches);

router.get(
  '/batches/:batchId',
  authorizeRoles(...IMPORT_ROLES),
  uploadController.getBatch
);

router.post(
  '/upload',
  authorizeRoles(...IMPORT_ROLES),
  uploadController.uploadMiddleware,
  uploadController.uploadWorkbook
);

router.get(
  '/:batchId/preview',
  authorizeRoles(...IMPORT_ROLES),
  uploadController.getPreview
);

router.post(
  '/:batchId/confirm',
  authorizeRoles(...IMPORT_ROLES),
  uploadController.confirmImport
);

router.post(
  '/:batchId/cancel',
  authorizeRoles(...IMPORT_ROLES),
  uploadController.cancelImport
);

module.exports = router;
