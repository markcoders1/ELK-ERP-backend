const express = require('express');
const authenticateExcelSync = require('./excelSync.auth');
const validate = require('../../middlewares/validate');
const excelSyncController = require('./excelSync.controller');
const { submitRules } = require('./excelSync.validator');

const router = express.Router();

/**
 * POST /api/hardware-excel-sync
 * Office Script → pending Hardware Change Requests (no live catalogue write).
 */
router.post('/', authenticateExcelSync, validate(submitRules), excelSyncController.submit);

/** Alias matching some client configs */
router.post(
  '/submit',
  authenticateExcelSync,
  validate(submitRules),
  excelSyncController.submit
);

module.exports = router;
