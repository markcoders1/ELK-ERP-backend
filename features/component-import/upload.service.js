const ImportBatch = require('../hardware-import/importBatch.model');
const ImportPreviewRow = require('../hardware-import/importPreviewRow.model');
const AuditLog = require('../hardware-approvals/auditLog.model');
const Component = require('../components/component.model');
const componentService = require('../components/component.service');
const AppError = require('../../utils/AppError');
const { parsePagination, buildPaginationMeta } = require('../../shared/pagination');
const {
  HTTP_STATUS,
  ENTITY_TYPES,
  IMPORT_MODULES,
  IMPORT_BATCH_STATUS,
  IMPORT_ROW_STATUS,
  IMPORT_DUPLICATE_STRATEGY,
  IMPORT_AUDIT_ACTIONS,
  IMPORT_CHUNK_SIZE,
  COMPONENT_IMPORT_APPLY_MODE,
  IMPORT_APPLY_MODE,
  COMPONENT_VERSION_STATUS,
  IMPORT_MAX_FILE_BYTES,
} = require('../../config/constants');
const {
  assertAllowedWorkbook,
  parseWorkbook,
  processInChunks,
} = require('../hardware-import/excel.parser');
const { buildHeaderLookup, normalizeComponentRow } = require('./normalizer');
const { validateComponentRow, buildComponentCodeCounts } = require('./validator');

const USER_SELECT = 'name email role';

const writeImportAudit = async ({
  action,
  actorId,
  batch,
  reason = null,
  snapshotAfter = null,
  componentCode = null,
  componentId = null,
}) => {
  await AuditLog.create({
    entityType: ENTITY_TYPES.IMPORT_BATCH,
    changeRequestId: null,
    hardwareId: null,
    componentId,
    componentCode,
    stockCode: null,
    action,
    decision: null,
    changedFields: [],
    submittedBy: actorId,
    decidedBy: actorId,
    reason,
    snapshotBefore: null,
    snapshotAfter: snapshotAfter || {
      batchId: batch._id || batch.id,
      batchCode: batch.batchCode,
      batchName: batch.batchName,
      filename: batch.filename,
      status: batch.status,
      stats: batch.stats,
      module: IMPORT_MODULES.COMPONENT,
    },
  });
};

const generateBatchCode = async () => {
  const now = new Date();
  const yyyymmdd = now.toISOString().slice(0, 10).replace(/-/g, '');
  const prefix = `CIMP-${yyyymmdd}-`;

  const latest = await ImportBatch.findOne({ batchCode: new RegExp(`^${prefix}`) })
    .sort({ batchCode: -1 })
    .select('batchCode')
    .lean();

  let next = 1;
  if (latest?.batchCode) {
    const suffix = Number(String(latest.batchCode).slice(prefix.length));
    if (Number.isFinite(suffix)) next = suffix + 1;
  }

  return `${prefix}${String(next).padStart(3, '0')}`;
};

const findBatchOrThrow = async (batchId) => {
  const batch = await ImportBatch.findById(batchId);
  if (!batch || batch.module !== IMPORT_MODULES.COMPONENT) {
    throw new AppError('Import batch not found', HTTP_STATUS.NOT_FOUND);
  }
  return batch;
};

const withIssueCodes = (issues = []) =>
  issues.map((issue, idx) => ({
    severity: issue.severity || 'ERROR',
    code: issue.code || `${issue.field || 'ROW'}_${issue.severity || 'ERROR'}_${idx}`,
    message: issue.message || 'Validation issue',
  }));

const summarizePreviewDocs = (docs) => {
  const stats = {
    rowsFound: docs.length,
    valid: 0,
    warnings: 0,
    errors: 0,
    duplicates: 0,
    rowsReady: 0,
    rowsSkipped: 0,
    rowsImported: 0,
  };

  for (const doc of docs) {
    if (doc.status === IMPORT_ROW_STATUS.VALID) {
      stats.valid += 1;
      stats.rowsReady += 1;
    } else if (doc.status === IMPORT_ROW_STATUS.WARNING) {
      stats.warnings += 1;
      stats.rowsReady += 1;
    } else if (doc.status === IMPORT_ROW_STATUS.ERROR) stats.errors += 1;
    else if (doc.status === IMPORT_ROW_STATUS.DUPLICATE) stats.duplicates += 1;
  }

  return stats;
};

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
    throw new AppError(
      error.message || 'Failed to parse workbook',
      error.statusCode || HTTP_STATUS.BAD_REQUEST
    );
  }

  const sheet = parsed.selectedSheet;
  if (!sheet || !sheet.rows.length) {
    throw new AppError('Selected worksheet has no data rows', HTTP_STATUS.BAD_REQUEST);
  }

  const headerLookup = buildHeaderLookup(sheet.headers);
  const normalizedRows = [];

  for (const row of sheet.rows) {
    const { normalized, display } = normalizeComponentRow(row.raw, headerLookup);
    normalizedRows.push({
      excelRowNumber: row.excelRowNumber,
      normalized,
      display,
    });
  }

  const existing = await Component.find({
    versionStatus: COMPONENT_VERSION_STATUS.APPROVED,
    deletedAt: null,
  })
    .select('componentCode')
    .lean();
  const existingCodes = new Set(existing.map((c) => c.componentCode));
  const fileCodeCounts = buildComponentCodeCounts(
    normalizedRows.map((r) => r.normalized)
  );

  const context = {
    existingCodes,
    fileCodeCounts,
    hardwareByStockCode: new Map(),
  };

  const previewDocs = [];
  await processInChunks(normalizedRows, IMPORT_CHUNK_SIZE, async (chunk) => {
    for (const row of chunk) {
      const validated = await validateComponentRow(row.normalized, context);
      previewDocs.push({
        batchId: null,
        module: IMPORT_MODULES.COMPONENT,
        excelRowNumber: row.excelRowNumber,
        stockCode: validated.normalized?.header?.componentCode || null,
        description: validated.normalized?.header?.description || null,
        status: validated.status,
        issues: withIssueCodes(validated.issues),
        payload: validated.normalized,
        isDuplicateInFile: (fileCodeCounts.get(validated.normalized?.header?.componentCode) || 0) > 1,
        isDuplicateInDatabase: existingCodes.has(validated.normalized?.header?.componentCode),
        hasPendingApproval: false,
      });
    }
  });

  const batchCode = await generateBatchCode();
  const stats = summarizePreviewDocs(previewDocs);

  const batch = await ImportBatch.create({
    module: IMPORT_MODULES.COMPONENT,
    batchName: batchName?.trim() || `Component Import — ${file.originalname}`,
    batchCode,
    filename: file.originalname,
    applyMode: COMPONENT_IMPORT_APPLY_MODE,
    sheetName: sheet.name,
    uploadedBy: user.id,
    uploadedAt: new Date(),
    status: IMPORT_BATCH_STATUS.PREVIEW,
    duplicateStrategy: IMPORT_DUPLICATE_STRATEGY.SKIP_EXISTING,
    stats,
  });

  const previewInserts = previewDocs.map((doc) => ({
    ...doc,
    batchId: batch._id,
  }));

  await processInChunks(previewInserts, IMPORT_CHUNK_SIZE, async (chunk) => {
    await ImportPreviewRow.insertMany(chunk, { ordered: false });
  });

  await writeImportAudit({
    action: IMPORT_AUDIT_ACTIONS.IMPORT_BATCH_CREATED,
    actorId: user.id,
    batch,
    reason: `Preview batch ${batchCode} created from ${file.originalname}`,
  });

  const populated = await ImportBatch.findById(batch._id)
    .populate('uploadedBy', USER_SELECT)
    .lean();

  return {
    batch: ImportBatch.toSafeObjectFromLean(populated),
    stats,
  };
};

const getPreview = async (batchId, query = {}) => {
  const batch = await findBatchOrThrow(batchId);
  const { page, limit, skip } = parsePagination(query);
  const filter = { batchId: batch._id, module: IMPORT_MODULES.COMPONENT };
  if (query.status) filter.status = query.status;

  const [items, total] = await Promise.all([
    ImportPreviewRow.find(filter)
      .sort({ excelRowNumber: 1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    ImportPreviewRow.countDocuments(filter),
  ]);

  return {
    batch: ImportBatch.toSafeObjectFromLean(batch.toObject()),
    items: items.map(ImportPreviewRow.toSafeObjectFromLean),
    pagination: buildPaginationMeta({ page, limit, total }),
  };
};

const confirmImport = async (batchId, _options = {}, user) => {
  const batch = await findBatchOrThrow(batchId);

  if (batch.status !== IMPORT_BATCH_STATUS.PREVIEW) {
    throw new AppError(
      'Only preview batches can be imported. This batch is already processed.',
      HTTP_STATUS.BAD_REQUEST
    );
  }

  if (COMPONENT_IMPORT_APPLY_MODE !== IMPORT_APPLY_MODE.DIRECT) {
    throw new AppError(
      'Approval-gated import mode is not enabled. Contact an administrator.',
      HTTP_STATUS.BAD_REQUEST
    );
  }

  batch.status = IMPORT_BATCH_STATUS.IMPORTING;
  batch.applyMode = IMPORT_APPLY_MODE.DIRECT;
  await batch.save();

  await writeImportAudit({
    action: IMPORT_AUDIT_ACTIONS.IMPORT_STARTED,
    actorId: user.id,
    batch,
  });

  let imported = 0;
  let skipped = 0;
  let failed = 0;

  const rows = await ImportPreviewRow.find({
    batchId: batch._id,
    module: IMPORT_MODULES.COMPONENT,
    status: {
      $in: [IMPORT_ROW_STATUS.VALID, IMPORT_ROW_STATUS.WARNING],
    },
  }).sort({ excelRowNumber: 1 });

  await processInChunks(rows, IMPORT_CHUNK_SIZE, async (chunk) => {
    for (const row of chunk) {
      try {
        const code = row.payload?.header?.componentCode;
        const existing = await componentService.findLiveByCode(code);
        if (existing) {
          skipped += 1;
          row.status = IMPORT_ROW_STATUS.SKIPPED;
          await row.save();
          continue;
        }

        const created = await componentService.create(row.payload, user.id, {
          importBatchId: batch.batchCode,
          importedBy: user.id,
          importedAt: new Date(),
        });

        imported += 1;
        await row.save();

        await writeImportAudit({
          action: IMPORT_AUDIT_ACTIONS.COMPONENT_IMPORTED,
          actorId: user.id,
          batch,
          componentCode: code,
          componentId: created.id,
          snapshotAfter: {
            batchCode: batch.batchCode,
            componentCode: code,
            componentId: created.id,
          },
        });
      } catch (error) {
        failed += 1;
        row.status = IMPORT_ROW_STATUS.ERROR;
        row.issues = [
          ...(row.issues || []),
          {
            severity: 'ERROR',
            code: 'IMPORT_FAILED',
            message: error.message,
          },
        ];
        await row.save();
      }
    }
  });

  const duplicateCount = await ImportPreviewRow.countDocuments({
    batchId: batch._id,
    status: IMPORT_ROW_STATUS.DUPLICATE,
  });
  skipped += duplicateCount;

  batch.status = IMPORT_BATCH_STATUS.COMPLETED;
  batch.stats = {
    ...batch.stats.toObject?.() || batch.stats,
    rowsImported: imported,
    rowsSkipped: skipped,
    failed,
  };
  await batch.save();

  await writeImportAudit({
    action: IMPORT_AUDIT_ACTIONS.IMPORT_COMPLETED,
    actorId: user.id,
    batch,
  });

  const populated = await ImportBatch.findById(batch._id)
    .populate('uploadedBy', USER_SELECT)
    .lean();

  return ImportBatch.toSafeObjectFromLean(populated);
};

const cancelImport = async (batchId, user) => {
  const batch = await findBatchOrThrow(batchId);
  if (batch.status !== IMPORT_BATCH_STATUS.PREVIEW) {
    throw new AppError('Only preview batches can be cancelled', HTTP_STATUS.BAD_REQUEST);
  }

  batch.status = IMPORT_BATCH_STATUS.CANCELLED;
  await batch.save();

  await writeImportAudit({
    action: IMPORT_AUDIT_ACTIONS.IMPORT_CANCELLED,
    actorId: user.id,
    batch,
  });

  const populated = await ImportBatch.findById(batch._id)
    .populate('uploadedBy', USER_SELECT)
    .lean();

  return ImportBatch.toSafeObjectFromLean(populated);
};

const listBatches = async (query = {}) => {
  const { page, limit, skip } = parsePagination(query);
  const filter = { module: IMPORT_MODULES.COMPONENT };
  if (query.status) filter.status = query.status;

  const [items, total] = await Promise.all([
    ImportBatch.find(filter)
      .sort({ uploadedAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('uploadedBy', USER_SELECT)
      .lean(),
    ImportBatch.countDocuments(filter),
  ]);

  return {
    items: items.map(ImportBatch.toSafeObjectFromLean),
    pagination: buildPaginationMeta({ page, limit, total }),
  };
};

const getBatchById = async (batchId) => {
  const batch = await ImportBatch.findById(batchId)
    .populate('uploadedBy', USER_SELECT)
    .lean();
  if (!batch || batch.module !== IMPORT_MODULES.COMPONENT) {
    throw new AppError('Import batch not found', HTTP_STATUS.NOT_FOUND);
  }
  return ImportBatch.toSafeObjectFromLean(batch);
};

module.exports = {
  processUpload,
  getPreview,
  confirmImport,
  cancelImport,
  listBatches,
  getBatchById,
};
