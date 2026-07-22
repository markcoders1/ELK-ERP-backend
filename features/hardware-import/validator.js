const { IMPORT_ROW_STATUS, PRICING_BASIS, ALL_PRICING_BASIS } = require('../../config/constants');

/**
 * Hardware-specific business validation after normalization.
 * Severity:
 *  - ERROR   → blocks import of that row
 *  - WARNING → allowed, surfaced in preview
 *  - INFO    → informational only
 */

const issue = (severity, code, message) => ({ severity, code, message });

const validateHardwareRow = (normalized, context = {}) => {
  const { payload, infos = [] } = normalized;
  const issues = [...infos];
  const {
    excelRowNumber,
    stockCodeCounts = new Map(),
    existingStockCodes = new Set(),
    pendingStockCodes = new Set(),
    existingHardwareByCode = new Map(),
    knownGroups = null,
  } = context;

  const rowLabel = `Row ${excelRowNumber}`;

  if (!payload.groupCode) {
    issues.push(issue('ERROR', 'MISSING_GROUP', `${rowLabel}: Group missing`));
  }

  if (!payload.stockCode) {
    issues.push(issue('ERROR', 'MISSING_STOCK_CODE', `${rowLabel}: Stock Code missing`));
  }

  if (!payload.description) {
    issues.push(issue('ERROR', 'MISSING_DESCRIPTION', `${rowLabel}: Description missing`));
  }

  if (payload.pricingBasis && !ALL_PRICING_BASIS.includes(payload.pricingBasis)) {
    issues.push(
      issue(
        'ERROR',
        'INVALID_PRICING_BASIS',
        `${rowLabel}: Pricing Basis invalid (expected Agreed or Retail)`
      )
    );
  }

  const numericFields = [
    { key: 'cpt', label: 'CPT', value: payload.regionalCosts?.cpt },
    { key: 'jhb', label: 'JHB', value: payload.regionalCosts?.jhb },
    { key: 'mnfMarkup', label: 'MNF Markup', value: payload.mnfMarkup },
    { key: 'frcMarkup', label: 'FRC Markup', value: payload.frcMarkup },
    { key: 'retailMarkup', label: 'RET Markup', value: payload.retailMarkup },
    { key: 'weight', label: 'Weight', value: payload.weight },
  ];

  numericFields.forEach(({ label, value }) => {
    if (value == null) return;
    if (typeof value !== 'number' || Number.isNaN(value)) {
      issues.push(issue('ERROR', 'INVALID_NUMBER', `${rowLabel}: ${label} is not a valid number`));
      return;
    }
    if (value < 0) {
      issues.push(issue('ERROR', 'NEGATIVE_VALUE', `${rowLabel}: ${label} cannot be negative`));
    }
  });

  if (!payload.supplierName) {
    issues.push(issue('WARNING', 'MISSING_SUPPLIER', `${rowLabel}: Supplier missing`));
  }

  if (!payload.supplierCode) {
    issues.push(issue('INFO', 'MISSING_SUPPLIER_CODE', `${rowLabel}: Supplier Code blank`));
  }

  if (payload.weight == null) {
    issues.push(issue('WARNING', 'MISSING_WEIGHT', `${rowLabel}: Weight missing`));
  }

  if (payload.mnfMarkup == null && payload.frcMarkup == null && payload.retailMarkup == null) {
    issues.push(issue('WARNING', 'MISSING_MARKUPS', `${rowLabel}: Markups missing — defaults will apply`));
  }

  if (knownGroups && knownGroups.size > 0 && payload.groupCode && !knownGroups.has(payload.groupCode)) {
    issues.push(
      issue('WARNING', 'UNKNOWN_GROUP', `${rowLabel}: Unknown group ${payload.groupCode}`)
    );
  }

  let isDuplicateInFile = false;
  let isDuplicateInDatabase = false;
  let hasPendingApproval = false;
  let existingHardwareId = null;

  if (payload.stockCode) {
    const count = stockCodeCounts.get(payload.stockCode) || 0;
    if (count > 1) {
      isDuplicateInFile = true;
      issues.push(
        issue(
          'ERROR',
          'DUPLICATE_IN_FILE',
          `${rowLabel}: Duplicate Stock Code ${payload.stockCode} inside uploaded file`
        )
      );
    }

    if (existingStockCodes.has(payload.stockCode)) {
      isDuplicateInDatabase = true;
      existingHardwareId = existingHardwareByCode.get(payload.stockCode) || null;
      issues.push(
        issue(
          'ERROR',
          'DUPLICATE_IN_DATABASE',
          `${rowLabel}: Duplicate Stock Code ${payload.stockCode} already exists — row skipped`
        )
      );
    }

    if (pendingStockCodes.has(payload.stockCode)) {
      hasPendingApproval = true;
      issues.push(
        issue(
          'ERROR',
          'PENDING_APPROVAL',
          `${rowLabel}: Stock Code ${payload.stockCode} already has a pending approval request`
        )
      );
    }
  }

  const hasError = issues.some((item) => item.severity === 'ERROR');
  const hasWarning = issues.some((item) => item.severity === 'WARNING');

  let status = IMPORT_ROW_STATUS.VALID;
  if (hasError) {
    // DB duplicates are reported as ERROR + DUPLICATE for filterability.
    status =
      isDuplicateInDatabase && !isDuplicateInFile
        ? IMPORT_ROW_STATUS.DUPLICATE
        : IMPORT_ROW_STATUS.ERROR;
  } else if (hasWarning) {
    status = IMPORT_ROW_STATUS.WARNING;
  }

  return {
    status,
    issues,
    isDuplicateInFile,
    isDuplicateInDatabase,
    hasPendingApproval,
    existingHardwareId,
    pricingBasis: payload.pricingBasis || PRICING_BASIS.AGREED,
  };
};

/**
 * First pass: count stock codes inside the file for duplicate detection.
 */
const buildStockCodeCounts = (normalizedRows) => {
  const counts = new Map();
  normalizedRows.forEach((row) => {
    const code = row.payload?.stockCode;
    if (!code) return;
    counts.set(code, (counts.get(code) || 0) + 1);
  });
  return counts;
};

module.exports = {
  validateHardwareRow,
  buildStockCodeCounts,
};
