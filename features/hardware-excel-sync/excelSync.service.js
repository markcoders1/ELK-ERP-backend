const HardwareItem = require('../hardware/hardwareItem.model');
const hardwareApprovalsService = require('../hardware-approvals/hardwareApprovals.service');
const AppError = require('../../utils/AppError');
const {
  HTTP_STATUS,
  EXCEL_SYNC_ROW_STATUS,
  PRICING_BASIS,
  ALL_PRICING_BASIS,
} = require('../../config/constants');
const { buildSubmitUpdatePayload } = require('./excelSync.normalizer');
const { verifyExcelCalculations } = require('./excelSync.verification');

const normalizeStockCode = (stockCode) =>
  String(stockCode || '')
    .trim()
    .toUpperCase();

const notDeletedFilter = { deletedAt: null };

/**
 * Strict source validation mirroring hardware.validator update semantics.
 * @returns {Array<{code:string,message:string,field?:string}>}
 */
const validateSourcePayload = (payload) => {
  const errors = [];

  if (!payload.groupCode || !String(payload.groupCode).trim()) {
    errors.push({ code: 'MISSING_GROUP', field: 'groupCode', message: 'Group code is required' });
  }
  if (!payload.description || !String(payload.description).trim()) {
    errors.push({
      code: 'MISSING_DESCRIPTION',
      field: 'description',
      message: 'Description is required',
    });
  }
  if (!payload.pricingBasis || !ALL_PRICING_BASIS.includes(payload.pricingBasis)) {
    errors.push({
      code: 'INVALID_PRICING_BASIS',
      field: 'pricingBasis',
      message: `Pricing basis must be one of: ${ALL_PRICING_BASIS.join(', ')}`,
    });
  }

  const positiveMarkups = [
    ['mnfMarkup', payload.mnfMarkup],
    ['frcMarkup', payload.frcMarkup],
  ];
  positiveMarkups.forEach(([field, value]) => {
    if (value === null || value === undefined || value === '') return;
    const number = Number(value);
    if (!Number.isFinite(number) || number <= 0) {
      errors.push({
        code: 'INVALID_MARKUP',
        field,
        message: `${field} must be a positive decimal value`,
      });
    }
  });

  if (
    payload.retailMarkup !== null &&
    payload.retailMarkup !== undefined &&
    payload.retailMarkup !== ''
  ) {
    const number = Number(payload.retailMarkup);
    if (!Number.isFinite(number) || number <= 0) {
      errors.push({
        code: 'INVALID_MARKUP',
        field: 'retailMarkup',
        message: 'retailMarkup must be a positive decimal value',
      });
    }
  }

  if (payload.pricingBasis === PRICING_BASIS.RETAIL) {
    if (
      payload.retFromSupplier === null ||
      payload.retFromSupplier === undefined ||
      payload.retFromSupplier === ''
    ) {
      errors.push({
        code: 'MISSING_RET_FROM_SUPPLIER',
        field: 'retFromSupplier',
        message: 'RET from Supplier is required when pricing basis is Retail',
      });
    }
  }

  const nonNeg = [
    ['regionalCosts.cpt', payload.regionalCosts?.cpt],
    ['regionalCosts.jhb', payload.regionalCosts?.jhb],
    ['retFromSupplier', payload.retFromSupplier],
    ['weight', payload.weight],
  ];
  nonNeg.forEach(([field, value]) => {
    if (value === null || value === undefined || value === '') return;
    const number = Number(value);
    if (!Number.isFinite(number) || number < 0) {
      errors.push({
        code: 'INVALID_NUMBER',
        field,
        message: `${field} must be a number >= 0`,
      });
    }
  });

  return errors;
};

const emptySummary = (received = 0) => ({
  received,
  pendingCreated: 0,
  noChange: 0,
  invalid: 0,
  pendingConflict: 0,
  unknownStockCode: 0,
  failed: 0,
});

const bumpSummary = (summary, status) => {
  switch (status) {
    case EXCEL_SYNC_ROW_STATUS.PENDING:
      summary.pendingCreated += 1;
      break;
    case EXCEL_SYNC_ROW_STATUS.NO_CHANGE:
      summary.noChange += 1;
      break;
    case EXCEL_SYNC_ROW_STATUS.INVALID:
      summary.invalid += 1;
      break;
    case EXCEL_SYNC_ROW_STATUS.PENDING_CONFLICT:
      summary.pendingConflict += 1;
      break;
    case EXCEL_SYNC_ROW_STATUS.UNKNOWN_STOCK_CODE:
      summary.unknownStockCode += 1;
      break;
    default:
      summary.failed += 1;
  }
};

/**
 * Process one Excel Sync row independently through existing submitUpdate.
 * Optional deps enable unit tests without a live Mongo/approval stack.
 */
const processRow = async (
  row,
  user,
  { sheetName },
  deps = {
    findHardwareByStockCode: (stockCode) =>
      HardwareItem.findOne({ stockCode, ...notDeletedFilter })
        .select('_id stockCode')
        .lean(),
    submitUpdate: (...args) => hardwareApprovalsService.submitUpdate(...args),
  }
) => {
  const excelRowNumber = row.excelRowNumber ?? null;
  const stockCodeRaw = row.stockCode;
  const stockCode = normalizeStockCode(stockCodeRaw);

  const baseResult = {
    excelRowNumber,
    stockCode: stockCode || stockCodeRaw || null,
    fingerprint: row.fingerprint || null,
  };

  if (!stockCode) {
    return {
      ...baseResult,
      status: EXCEL_SYNC_ROW_STATUS.INVALID,
      errors: [{ code: 'MISSING_STOCK_CODE', message: 'Stock Code is required' }],
    };
  }

  const item = await deps.findHardwareByStockCode(stockCode);

  if (!item) {
    return {
      ...baseResult,
      stockCode,
      status: EXCEL_SYNC_ROW_STATUS.UNKNOWN_STOCK_CODE,
      errors: [
        {
          code: 'UNKNOWN_STOCK_CODE',
          message: `No live hardware found for stock code ${stockCode}`,
        },
      ],
    };
  }

  const payload = buildSubmitUpdatePayload(row.source || {}, {
    excelRowNumber,
    sheetName,
  });

  const validationErrors = validateSourcePayload(payload);
  if (validationErrors.length > 0) {
    return {
      ...baseResult,
      stockCode,
      status: EXCEL_SYNC_ROW_STATUS.INVALID,
      errors: validationErrors,
    };
  }

  const verificationInput = {
    cpt: payload.regionalCosts?.cpt,
    jhb: payload.regionalCosts?.jhb,
    pricingBasis: payload.pricingBasis,
    mnfMarkup: payload.mnfMarkup,
    frcMarkup: payload.frcMarkup,
    retailMarkup: payload.retailMarkup,
    retFromSupplier: payload.retFromSupplier,
  };

  const verification = verifyExcelCalculations(
    verificationInput,
    row.verification || {}
  );

  if (!verification.ok) {
    return {
      ...baseResult,
      stockCode,
      status: EXCEL_SYNC_ROW_STATUS.INVALID,
      errors: verification.mismatches,
    };
  }

  try {
    const changeRequest = await deps.submitUpdate(
      item._id.toString(),
      payload,
      user
    );

    return {
      ...baseResult,
      stockCode,
      status: EXCEL_SYNC_ROW_STATUS.PENDING,
      changeRequestId: changeRequest.id || changeRequest._id,
      changedFields: changeRequest.changedFields || [],
      updateBaseline: true,
    };
  } catch (error) {
    if (error instanceof AppError) {
      if (
        error.statusCode === HTTP_STATUS.BAD_REQUEST &&
        /no changes detected/i.test(error.message)
      ) {
        return {
          ...baseResult,
          stockCode,
          status: EXCEL_SYNC_ROW_STATUS.NO_CHANGE,
          updateBaseline: true,
        };
      }

      if (error.statusCode === HTTP_STATUS.CONFLICT) {
        return {
          ...baseResult,
          stockCode,
          status: EXCEL_SYNC_ROW_STATUS.PENDING_CONFLICT,
          errors: [
            {
              code: 'PENDING_CONFLICT',
              message: error.message,
            },
          ],
          updateBaseline: false,
        };
      }

      return {
        ...baseResult,
        stockCode,
        status: EXCEL_SYNC_ROW_STATUS.INVALID,
        errors: [
          {
            code: 'VALIDATION_ERROR',
            message: error.message,
            details: error.errors || null,
          },
        ],
      };
    }

    console.error('[hardware-excel-sync] row failed', {
      stockCode,
      excelRowNumber,
      message: error.message,
    });

    return {
      ...baseResult,
      stockCode,
      status: EXCEL_SYNC_ROW_STATUS.FAILED,
      errors: [{ code: 'INTERNAL_ERROR', message: 'Unexpected error processing row' }],
    };
  }
};

/**
 * Batch Excel Sync submit — partial success, sequential for correctness.
 */
const submitSync = async ({ body, user, requestId = null, deps } = {}) => {
  const started = Date.now();
  const sheetName = body.workbook?.sheetName || 'Master File';
  const rows = Array.isArray(body.rows) ? body.rows : [];

  console.info('[hardware-excel-sync] submit start', {
    requestId,
    received: rows.length,
    sheetName,
    userId: user?.id,
  });

  const summary = emptySummary(rows.length);
  const results = [];
  const seenStockCodes = new Map();

  // Sequential — expected batch is ~10–20 rows; preserves correctness.
  // eslint-disable-next-line no-restricted-syntax
  for (const row of rows) {
    const stockCode = normalizeStockCode(row.stockCode);

    if (stockCode && seenStockCodes.has(stockCode)) {
      const duplicateResult = {
        excelRowNumber: row.excelRowNumber ?? null,
        stockCode,
        fingerprint: row.fingerprint || null,
        status: EXCEL_SYNC_ROW_STATUS.INVALID,
        errors: [
          {
            code: 'DUPLICATE_STOCK_CODE_IN_REQUEST',
            message: `Duplicate Stock Code ${stockCode} in the same sync request`,
          },
        ],
        updateBaseline: false,
      };
      results.push(duplicateResult);
      bumpSummary(summary, duplicateResult.status);
      continue;
    }

    if (stockCode) {
      seenStockCodes.set(stockCode, true);
    }

    // eslint-disable-next-line no-await-in-loop
    const result = await processRow(row, user, { sheetName }, deps);
    results.push(result);
    bumpSummary(summary, result.status);

    console.info('[hardware-excel-sync] row result', {
      requestId,
      stockCode: result.stockCode,
      status: result.status,
      excelRowNumber: result.excelRowNumber,
    });
  }

  console.info('[hardware-excel-sync] submit complete', {
    requestId,
    durationMs: Date.now() - started,
    summary,
  });

  return {
    summary,
    results,
    sheetName,
    requestId,
  };
};

module.exports = {
  submitSync,
  processRow,
  validateSourcePayload,
  normalizeStockCode,
};
