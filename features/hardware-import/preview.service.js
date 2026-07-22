const ImportPreviewRow = require('./importPreviewRow.model');
const { IMPORT_ROW_STATUS } = require('../../config/constants');
const { parsePagination, buildPaginationMeta } = require('../../shared/pagination');

const STATUS_FILTERS = {
  errors: [IMPORT_ROW_STATUS.ERROR, IMPORT_ROW_STATUS.DUPLICATE],
  warnings: [IMPORT_ROW_STATUS.WARNING],
  valid: [IMPORT_ROW_STATUS.VALID, IMPORT_ROW_STATUS.WARNING],
  duplicates: [IMPORT_ROW_STATUS.DUPLICATE],
  ready: [IMPORT_ROW_STATUS.VALID, IMPORT_ROW_STATUS.WARNING],
  all: null,
};

const buildPreviewFilter = (batchId, query = {}) => {
  const filter = { batchId };

  const statusKey = String(query.filter || query.status || 'all').toLowerCase();
  const statuses = STATUS_FILTERS[statusKey];
  if (statuses) {
    filter.status = { $in: statuses };
  }

  if (query.search) {
    const term = String(query.search).trim();
    if (term) {
      filter.$or = [
        { stockCode: new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') },
        { description: new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') },
      ];
    }
  }

  return filter;
};

const getPreviewRows = async (batchId, query = {}) => {
  const { page, limit, skip } = parsePagination(query);
  const filter = buildPreviewFilter(batchId, query);

  const [items, total] = await Promise.all([
    ImportPreviewRow.find(filter)
      .sort({ excelRowNumber: 1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    ImportPreviewRow.countDocuments(filter),
  ]);

  return {
    items: items.map(ImportPreviewRow.toSafeObjectFromLean),
    pagination: buildPaginationMeta({ page, limit, total }),
  };
};

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

  docs.forEach((doc) => {
    const hasWarning = (doc.issues || []).some((item) => item.severity === 'WARNING');
    if (doc.status === IMPORT_ROW_STATUS.ERROR) {
      stats.errors += 1;
      stats.rowsSkipped += 1;
      return;
    }
    if (doc.status === IMPORT_ROW_STATUS.DUPLICATE) {
      stats.duplicates += 1;
      stats.errors += 1;
      stats.rowsSkipped += 1;
      return;
    }
    if (doc.status === IMPORT_ROW_STATUS.WARNING) {
      stats.warnings += 1;
      stats.valid += 1;
      stats.rowsReady += 1;
      return;
    }
    stats.valid += 1;
    stats.rowsReady += 1;
  });

  return stats;
};

module.exports = {
  getPreviewRows,
  summarizePreviewDocs,
  STATUS_FILTERS,
};
