const { IMPORT_ROW_STATUS } = require('../../config/constants');
const HardwareItem = require('../hardware/hardwareItem.model');

/**
 * Soft validation for Component import rows.
 * Continues on failures — never rejects whole file for blank optionals.
 */
const validateComponentRow = async (normalized, context = {}) => {
  const issues = [];
  const header = normalized?.header || {};

  if (!header.componentCode) {
    issues.push({
      field: 'componentCode',
      severity: 'ERROR',
      message: 'Component code is required',
    });
  }

  if (!header.description) {
    issues.push({
      field: 'description',
      severity: 'ERROR',
      message: 'Description is required',
    });
  }

  if (context.existingCodes?.has(header.componentCode)) {
    issues.push({
      field: 'componentCode',
      severity: 'ERROR',
      message: 'Component code already exists in catalogue (will be skipped)',
      code: 'DUPLICATE',
    });
  }

  if (context.fileCodeCounts?.get(header.componentCode) > 1) {
    issues.push({
      field: 'componentCode',
      severity: 'WARNING',
      message: 'Duplicate component code within this file',
    });
  }

  // Resolve hardware stock codes → ids where possible
  const hardwareSection = (normalized.sections || []).find(
    (s) => s.sectionType === 'HARDWARE'
  );
  if (hardwareSection) {
    for (const item of hardwareSection.items || []) {
      const stockCode = String(item.attributes?.stockCode || '')
        .trim()
        .toUpperCase();
      if (!item.hardwareId && stockCode) {
        const hw =
          context.hardwareByStockCode?.get(stockCode) ||
          (await HardwareItem.findOne({
            stockCode,
            deletedAt: null,
          })
            .select('_id stockCode')
            .lean());

        if (hw) {
          item.hardwareId = hw._id;
          item.attributes.hardwareId = hw._id.toString();
          if (context.hardwareByStockCode) {
            context.hardwareByStockCode.set(stockCode, hw);
          }
        } else {
          issues.push({
            field: 'hardware',
            severity: 'WARNING',
            message: `Hardware stock code ${stockCode} not found — link left unresolved`,
          });
        }
      }
    }
  }

  const hasDuplicate = issues.some((i) => i.code === 'DUPLICATE');
  const hasError = issues.some((i) => i.severity === 'ERROR');
  const hasWarning = issues.some((i) => i.severity === 'WARNING');

  let status = IMPORT_ROW_STATUS.VALID;
  if (hasDuplicate) status = IMPORT_ROW_STATUS.DUPLICATE;
  else if (hasError) status = IMPORT_ROW_STATUS.ERROR;
  else if (hasWarning) status = IMPORT_ROW_STATUS.WARNING;

  return { status, issues, normalized };
};

const buildComponentCodeCounts = (normalizedRows) => {
  const counts = new Map();
  for (const row of normalizedRows) {
    const code = row?.header?.componentCode;
    if (!code) continue;
    counts.set(code, (counts.get(code) || 0) + 1);
  }
  return counts;
};

module.exports = {
  validateComponentRow,
  buildComponentCodeCounts,
};
