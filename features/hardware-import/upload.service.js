const ImportBatch = require('./importBatch.model');
const ImportPreviewRow = require('./importPreviewRow.model');
const HardwareItem = require('../hardware/hardwareItem.model');
const ChangeRequest = require('../hardware-approvals/changeRequest.model');
const { assertAllowedWorkbook, parseWorkbook, processInChunks } = require('./excel.parser');
const { normalizeHardwareRow } = require('./normalizer');
const { validateHardwareRow, buildStockCodeCounts } = require('./validator');
const { summarizePreviewDocs } = require('./preview.service');
const { writeImportAudit, generateBatchCode } = require('./batch.service');
const AppError = require('../../utils/AppError');
const {
  HTTP_STATUS,
  IMPORT_MODULES,
  IMPORT_BATCH_STATUS,
  IMPORT_CHUNK_SIZE,
  IMPORT_MAX_FILE_BYTES,
  IMPORT_AUDIT_ACTIONS,
  IMPORT_DUPLICATE_STRATEGY,
  IMPORT_APPLY_MODE,
  HARDWARE_IMPORT_APPLY_MODE,
  CHANGE_REQUEST_STATUS,
  ENTITY_TYPES,
} = require('../../config/constants');

const USER_SELECT = 'name email role';

/**
 * Load existing catalogue + pending approval stock codes in chunks.
 */
const loadExistingContext = async (stockCodes) => {
  const existingStockCodes = new Set();
  const pendingStockCodes = new Set();
  const existingHardwareByCode = new Map();
  const knownGroups = new Set();

  const uniqueCodes = [...new Set(stockCodes.filter(Boolean))];

  await processInChunks(uniqueCodes, IMPORT_CHUNK_SIZE, async (chunk) => {
    const [items, pending] = await Promise.all([
      HardwareItem.find({
        stockCode: { $in: chunk },
        deletedAt: null,
      })
        .select('_id stockCode groupCode')
        .lean(),
      ChangeRequest.find({
        entityType: ENTITY_TYPES.HARDWARE,
        status: CHANGE_REQUEST_STATUS.PENDING,
        'snapshotAfter.stockCode': { $in: chunk },
      })
        .select('snapshotAfter.stockCode')
        .lean(),
    ]);

    items.forEach((item) => {
      existingStockCodes.add(item.stockCode);
      existingHardwareByCode.set(item.stockCode, item._id);
      if (item.groupCode) knownGroups.add(item.groupCode);
    });

    pending.forEach((req) => {
      const code = req.snapshotAfter?.stockCode;
      if (code) pendingStockCodes.add(code);
    });
  });

  // Seed known groups from a broader sample for WARNING on unknown groups.
  const groupDocs = await HardwareItem.distinct('groupCode', { deletedAt: null });
  groupDocs.forEach((code) => {
    if (code) knownGroups.add(code);
  });

  return {
    existingStockCodes,
    pendingStockCodes,
    existingHardwareByCode,
    knownGroups,
  };
};

/**
 * Upload → parse → normalize → validate → preview batch.
 * Does not create change requests or live hardware.
 */
const processUpload = async ({ file, user, batchName, sheetName, sheetIndex }) => {
  if (!file) {
    throw new AppError('Excel file is required', HTTP_STATUS.BAD_REQUEST);
  }

  if (file.size > IMPORT_MAX_FILE_BYTES) {
    throw new AppError('File exceeds the 20MB upload limit', HTTP_STATUS.BAD_REQUEST);
  }

  assertAllowedWorkbook(file.originalname);

  let parsed;
  try {
    parsed = parseWorkbook(file.buffer, { sheetName, sheetIndex });
  } catch (error) {
    throw new AppError(error.message || 'Failed to parse workbook', error.statusCode || HTTP_STATUS.BAD_REQUEST);
  }

  const sheet = parsed.selectedSheet;
  if (!sheet.rows.length) {
    throw new AppError('Selected worksheet has no data rows', HTTP_STATUS.BAD_REQUEST);
  }

  const name =
    (batchName && String(batchName).trim()) ||
    `Hardware Import — ${file.originalname} — ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`;

  const batchCode = await generateBatchCode();

  const batch = await ImportBatch.create({
    module: IMPORT_MODULES.HARDWARE,
    batchName: name,
    batchCode,
    filename: file.originalname,
    sheetName: sheet.name,
    uploadedBy: user.id,
    uploadedAt: new Date(),
    status: IMPORT_BATCH_STATUS.PREVIEW,
    applyMode: HARDWARE_IMPORT_APPLY_MODE || IMPORT_APPLY_MODE.DIRECT,
    duplicateStrategy: IMPORT_DUPLICATE_STRATEGY.SKIP_EXISTING,
    stats: {
      rowsFound: sheet.rows.length,
      valid: 0,
      warnings: 0,
      errors: 0,
      duplicates: 0,
      rowsReady: 0,
      rowsSkipped: 0,
      rowsImported: 0,
    },
  });

  await writeImportAudit({
    action: IMPORT_AUDIT_ACTIONS.IMPORT_BATCH_CREATED,
    actorId: user.id,
    batch,
    reason: `Preview batch ${batchCode} created from ${file.originalname}`,
  });

  // Pass 1 — normalize all rows (in chunks for CPU breathing room on 20k+ files).
  const normalizedRows = [];
  await processInChunks(sheet.rows, IMPORT_CHUNK_SIZE, async (chunk) => {
    chunk.forEach((row) => {
      const normalized = normalizeHardwareRow(row.raw, sheet.headers);
      normalizedRows.push({
        excelRowNumber: row.excelRowNumber,
        ...normalized,
      });
    });
  });

  const stockCodeCounts = buildStockCodeCounts(normalizedRows);
  const stockCodes = normalizedRows.map((row) => row.payload?.stockCode).filter(Boolean);
  const dbContext = await loadExistingContext(stockCodes);

  // Pass 2 — validate + persist preview rows in chunks.
  const previewDocs = [];

  await processInChunks(normalizedRows, IMPORT_CHUNK_SIZE, async (chunk) => {
    const docs = chunk.map((row) => {
      const validation = validateHardwareRow(row, {
        excelRowNumber: row.excelRowNumber,
        stockCodeCounts,
        ...dbContext,
      });

      // Strip undefined markups so approval snapshot defaults apply.
      const payload = { ...row.payload };
      if (payload.mnfMarkup == null) delete payload.mnfMarkup;
      if (payload.frcMarkup == null) delete payload.frcMarkup;
      if (payload.retailMarkup == null) delete payload.retailMarkup;
      if (payload.weight == null) delete payload.weight;

      return {
        batchId: batch._id,
        module: IMPORT_MODULES.HARDWARE,
        excelRowNumber: row.excelRowNumber,
        stockCode: payload.stockCode,
        description: payload.description,
        status: validation.status,
        issues: validation.issues,
        payload,
        existingHardwareId: validation.existingHardwareId,
        isDuplicateInFile: validation.isDuplicateInFile,
        isDuplicateInDatabase: validation.isDuplicateInDatabase,
        hasPendingApproval: validation.hasPendingApproval,
      };
    });

    previewDocs.push(...docs);
    await ImportPreviewRow.insertMany(docs, { ordered: false });
  });

  const stats = summarizePreviewDocs(previewDocs);
  batch.stats = stats;
  await batch.save();

  const populated = await ImportBatch.findById(batch._id)
    .populate('uploadedBy', USER_SELECT)
    .lean();

  return {
    batch: ImportBatch.toSafeObjectFromLean(populated),
    sheetNames: parsed.sheetNames,
    selectedSheet: sheet.name,
  };
};

module.exports = {
  processUpload,
  loadExistingContext,
};
