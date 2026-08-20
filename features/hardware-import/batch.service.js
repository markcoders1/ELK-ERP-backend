const ImportBatch = require('./importBatch.model');
const ImportPreviewRow = require('./importPreviewRow.model');
const AuditLog = require('../hardware-approvals/auditLog.model');
const hardwareService = require('../hardware/hardware.service');
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
  HARDWARE_IMPORT_APPLY_MODE,
  IMPORT_APPLY_MODE,
} = require('../../config/constants');

const USER_SELECT = 'name email role';

const writeImportAudit = async ({
  action,
  actorId,
  batch,
  reason = null,
  snapshotAfter = null,
  stockCode = null,
  hardwareId = null,
  entityType = ENTITY_TYPES.IMPORT_BATCH,
}) => {
  await AuditLog.create({
    entityType,
    changeRequestId: null,
    hardwareId,
    stockCode,
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
    },
  });
};

/**
 * Generate IMP-YYYYMMDD-NNN batch codes.
 */
const generateBatchCode = async () => {
  const now = new Date();
  const yyyymmdd = now.toISOString().slice(0, 10).replace(/-/g, '');
  const prefix = `IMP-${yyyymmdd}-`;

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
  if (!batch || batch.module !== IMPORT_MODULES.HARDWARE) {
    throw new AppError('Import batch not found', HTTP_STATUS.NOT_FOUND);
  }
  return batch;
};

const listBatches = async (query = {}) => {
  const { page, limit, skip } = parsePagination(query);
  const filter = { module: IMPORT_MODULES.HARDWARE };

  if (query.status) {
    filter.status = query.status;
  }

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
  const batch = await ImportBatch.findById(batchId).populate('uploadedBy', USER_SELECT).lean();
  if (!batch || batch.module !== IMPORT_MODULES.HARDWARE) {
    throw new AppError('Import batch not found', HTTP_STATUS.NOT_FOUND);
  }
  return ImportBatch.toSafeObjectFromLean(batch);
};

/**
 * Confirm import: write live HardwareItem rows directly (migration path).
 * Does NOT create pending change requests or notify Managers.
 * Controlled by HARDWARE_IMPORT_APPLY_MODE (DIRECT today; APPROVAL reserved).
 */
const confirmImport = async (batchId, _options = {}, user) => {
  const batch = await findBatchOrThrow(batchId);

  if (batch.status !== IMPORT_BATCH_STATUS.PREVIEW) {
    throw new AppError(
      'Only preview batches can be imported. This batch is already processed.',
      HTTP_STATUS.BAD_REQUEST
    );
  }

  if (HARDWARE_IMPORT_APPLY_MODE !== IMPORT_APPLY_MODE.DIRECT) {
    throw new AppError(
      'Approval-gated import mode is not enabled. Contact an administrator.',
      HTTP_STATUS.BAD_REQUEST
    );
  }

  // Direct migration: insert new rows; update existing stock codes in place (AD-024 / client rule).
  const strategy = IMPORT_DUPLICATE_STRATEGY.UPDATE_EXISTING;

  batch.status = IMPORT_BATCH_STATUS.IMPORTING;
  batch.duplicateStrategy = strategy;
  batch.applyMode = IMPORT_APPLY_MODE.DIRECT;
  await batch.save();

  await writeImportAudit({
    action: IMPORT_AUDIT_ACTIONS.IMPORT_STARTED,
    actorId: user.id,
    batch,
    reason: `Direct live import started (${batch.batchCode})`,
  });

  const readyStatuses = [
    IMPORT_ROW_STATUS.VALID,
    IMPORT_ROW_STATUS.WARNING,
    IMPORT_ROW_STATUS.DUPLICATE,
  ];
  const importedAt = new Date();
  let rowsImported = 0;
  let rowsUpdated = 0;
  let rowsSkipped = batch.stats?.rowsSkipped || 0;
  let duplicatesSkipped = 0;

  try {
    // eslint-disable-next-line no-constant-condition
    while (true) {
      // eslint-disable-next-line no-await-in-loop
      const rows = await ImportPreviewRow.find({
        batchId: batch._id,
        status: { $in: readyStatuses },
      })
        .sort({ excelRowNumber: 1 })
        .limit(IMPORT_CHUNK_SIZE)
        .lean();

      if (rows.length === 0) break;

      const insertPayloads = [];
      const updatePayloads = [];
      const metaByStockCode = new Map();
      const skippedIds = [];
      const candidateIds = [];

      for (const row of rows) {
        if (row.status === IMPORT_ROW_STATUS.ERROR && !row.isDuplicateInDatabase) {
          rowsSkipped += 1;
          skippedIds.push(row._id);
          continue;
        }

        if (!row.payload?.stockCode || !row.payload?.groupCode || !row.payload?.description) {
          rowsSkipped += 1;
          skippedIds.push(row._id);
          continue;
        }

        metaByStockCode.set(row.payload.stockCode, row);
        candidateIds.push(row._id);

        if (row.isDuplicateInDatabase || row.status === IMPORT_ROW_STATUS.DUPLICATE) {
          updatePayloads.push(row.payload);
        } else {
          insertPayloads.push(row.payload);
        }
      }

      if (skippedIds.length > 0) {
        // eslint-disable-next-line no-await-in-loop
        await ImportPreviewRow.updateMany(
          { _id: { $in: skippedIds } },
          { $set: { status: IMPORT_ROW_STATUS.SKIPPED } }
        );
      }

      const processedIds = [];
      const auditDocs = [];

      if (insertPayloads.length > 0) {
        // eslint-disable-next-line no-await-in-loop
        const inserted = await hardwareService.createManyFromImport(insertPayloads, {
          userId: user.id,
          importBatchId: batch.batchCode,
          importedAt,
        });

        inserted.forEach((doc) => {
          const previewRow = metaByStockCode.get(doc.stockCode);
          if (!previewRow) return;

          processedIds.push(previewRow._id);
          rowsImported += 1;

          auditDocs.push({
            entityType: ENTITY_TYPES.HARDWARE,
            changeRequestId: null,
            hardwareId: doc._id,
            stockCode: doc.stockCode,
            action: IMPORT_AUDIT_ACTIONS.HARDWARE_IMPORTED,
            decision: null,
            changedFields: [],
            submittedBy: user.id,
            decidedBy: user.id,
            reason: `Imported from ${batch.filename} row ${previewRow.excelRowNumber}`,
            snapshotBefore: null,
            snapshotAfter: {
              filename: batch.filename,
              excelRowNumber: previewRow.excelRowNumber,
              stockCode: doc.stockCode,
              importBatchId: batch.batchCode,
              batchMongoId: batch._id,
              hardwareId: doc._id,
              importedAt,
              applyMode: 'INSERT',
            },
          });
        });
      }

      if (updatePayloads.length > 0) {
        // eslint-disable-next-line no-await-in-loop
        const { updated } = await hardwareService.updateManyFromImport(updatePayloads, {
          userId: user.id,
          importBatchId: batch.batchCode,
          importedAt,
        });

        updated.forEach((doc) => {
          const previewRow = metaByStockCode.get(doc.stockCode);
          if (!previewRow) return;

          processedIds.push(previewRow._id);
          rowsUpdated += 1;

          auditDocs.push({
            entityType: ENTITY_TYPES.HARDWARE,
            changeRequestId: null,
            hardwareId: doc._id,
            stockCode: doc.stockCode,
            action: IMPORT_AUDIT_ACTIONS.HARDWARE_IMPORTED,
            decision: null,
            changedFields: [],
            submittedBy: user.id,
            decidedBy: user.id,
            reason: `Updated from ${batch.filename} row ${previewRow.excelRowNumber} (direct re-import)`,
            snapshotBefore: null,
            snapshotAfter: {
              filename: batch.filename,
              excelRowNumber: previewRow.excelRowNumber,
              stockCode: doc.stockCode,
              importBatchId: batch.batchCode,
              batchMongoId: batch._id,
              hardwareId: doc._id,
              importedAt,
              applyMode: 'UPDATE',
            },
          });
        });
      }

      // Rows that failed insert/update are marked skipped.
      const failedIds = candidateIds.filter(
        (id) => !processedIds.some((processedId) => String(processedId) === String(id))
      );

      if (processedIds.length > 0) {
        // eslint-disable-next-line no-await-in-loop
        await ImportPreviewRow.updateMany(
          { _id: { $in: processedIds } },
          { $set: { status: IMPORT_ROW_STATUS.QUEUED } }
        );
      }

      if (failedIds.length > 0) {
        rowsSkipped += failedIds.length;
        // eslint-disable-next-line no-await-in-loop
        await ImportPreviewRow.updateMany(
          { _id: { $in: failedIds } },
          { $set: { status: IMPORT_ROW_STATUS.SKIPPED } }
        );
      }

      if (auditDocs.length > 0) {
        // eslint-disable-next-line no-await-in-loop
        await AuditLog.insertMany(auditDocs, { ordered: false });
      }
    }

    batch.status = IMPORT_BATCH_STATUS.COMPLETED;
    batch.completedAt = new Date();
    batch.changeRequestIds = [];
    batch.stats = {
      ...(batch.stats.toObject?.() || batch.stats),
      rowsImported,
      rowsUpdated,
      rowsSkipped,
      duplicates: duplicatesSkipped,
      rowsReady: Math.max(0, batch.stats?.rowsReady || 0),
    };
    await batch.save();

    await writeImportAudit({
      action: IMPORT_AUDIT_ACTIONS.IMPORT_COMPLETED,
      actorId: user.id,
      batch,
      reason: `Import completed — ${rowsImported} inserted, ${rowsUpdated} updated live, ${rowsSkipped} skipped`,
      snapshotAfter: {
        batchId: batch._id,
        batchCode: batch.batchCode,
        batchName: batch.batchName,
        filename: batch.filename,
        rowsImported,
        rowsUpdated,
        rowsSkipped,
        duplicates: duplicatesSkipped,
        applyMode: IMPORT_APPLY_MODE.DIRECT,
      },
    });

    const populated = await ImportBatch.findById(batch._id)
      .populate('uploadedBy', USER_SELECT)
      .lean();

    return ImportBatch.toSafeObjectFromLean(populated);
  } catch (error) {
    batch.status = IMPORT_BATCH_STATUS.FAILED;
    batch.errorMessage = error.message || 'Import failed';
    await batch.save();

    await writeImportAudit({
      action: IMPORT_AUDIT_ACTIONS.IMPORT_COMPLETED,
      actorId: user.id,
      batch,
      reason: `Import failed: ${batch.errorMessage}`,
    });

    throw error;
  }
};

const cancelImport = async (batchId, user) => {
  const batch = await findBatchOrThrow(batchId);

  if (
    batch.status !== IMPORT_BATCH_STATUS.PREVIEW &&
    batch.status !== IMPORT_BATCH_STATUS.FAILED
  ) {
    throw new AppError('Only preview or failed batches can be cancelled', HTTP_STATUS.BAD_REQUEST);
  }

  batch.status = IMPORT_BATCH_STATUS.CANCELLED;
  batch.cancelledAt = new Date();
  await batch.save();

  await ImportPreviewRow.deleteMany({ batchId: batch._id });

  await writeImportAudit({
    action: IMPORT_AUDIT_ACTIONS.IMPORT_CANCELLED,
    actorId: user.id,
    batch,
    reason: 'Import cancelled by user',
  });

  const populated = await ImportBatch.findById(batch._id)
    .populate('uploadedBy', USER_SELECT)
    .lean();

  return ImportBatch.toSafeObjectFromLean(populated);
};

const getDashboardSummary = async () => {
  const [latestBatch, failedImports] = await Promise.all([
    ImportBatch.findOne({ module: IMPORT_MODULES.HARDWARE })
      .sort({ uploadedAt: -1 })
      .populate('uploadedBy', USER_SELECT)
      .lean(),
    ImportBatch.countDocuments({
      module: IMPORT_MODULES.HARDWARE,
      status: IMPORT_BATCH_STATUS.FAILED,
    }),
  ]);

  const latestCompleted = await ImportBatch.findOne({
    module: IMPORT_MODULES.HARDWARE,
    status: IMPORT_BATCH_STATUS.COMPLETED,
  })
    .sort({ completedAt: -1 })
    .lean();

  return {
    latestImport: latestBatch ? ImportBatch.toSafeObjectFromLean(latestBatch) : null,
    // Direct import never leaves pending approval rows.
    pendingImportedRows: 0,
    lastImportRowsImported: latestCompleted?.stats?.rowsImported || 0,
    failedImports,
    lastImportTime:
      latestCompleted?.completedAt ||
      latestBatch?.completedAt ||
      latestBatch?.uploadedAt ||
      null,
  };
};

module.exports = {
  listBatches,
  getBatchById,
  confirmImport,
  cancelImport,
  getDashboardSummary,
  writeImportAudit,
  findBatchOrThrow,
  generateBatchCode,
};
