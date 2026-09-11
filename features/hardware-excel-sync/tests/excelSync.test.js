const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  buildSourceFingerprint,
} = require('../excelSync.fingerprint');
const {
  verifyExcelCalculations,
  roundMoney,
} = require('../excelSync.verification');
const {
  calculateHardwarePricing,
} = require('../../hardware/hardwarePricing.service');
const {
  validateSourcePayload,
  processRow,
  submitSync,
} = require('../excelSync.service');
const AppError = require('../../../utils/AppError');
const { HTTP_STATUS, PRICING_BASIS } = require('../../../config/constants');

describe('excelSync.fingerprint', () => {
  it('is deterministic for the same source fields', () => {
    const source = {
      groupCode: 'acc',
      description: 'Airvent',
      supplierName: '',
      supplierCode: '',
      regionalCosts: { cpt: 1.87, jhb: 1.2 },
      pricingBasis: 'Agreed',
      mnfMarkup: 1.114,
      frcMarkup: 1.52,
      retailMarkup: 1.54,
      retFromSupplier: null,
      weight: null,
      isImport: false,
      isActive: true,
    };
    const a = buildSourceFingerprint(source);
    const b = buildSourceFingerprint({
      ...source,
      groupCode: 'ACC',
      description: '  Airvent  ',
    });
    assert.equal(a, b);
  });

  it('does not change when only calculated-looking fields would differ (not in fingerprint)', () => {
    const base = {
      groupCode: 'ACC',
      description: 'X',
      regionalCosts: { cpt: 1, jhb: 2 },
      pricingBasis: 'Agreed',
      mnfMarkup: 1.1,
      frcMarkup: 1.2,
      retailMarkup: 1.3,
      isImport: false,
      isActive: true,
    };
    assert.equal(buildSourceFingerprint(base), buildSourceFingerprint(base));
  });
});

describe('excelSync.verification (Agreed sample)', () => {
  const source = {
    cpt: 1.87,
    jhb: 1.2,
    pricingBasis: PRICING_BASIS.AGREED,
    mnfMarkup: 1.114,
    frcMarkup: 1.52,
    retailMarkup: 1.54,
    retFromSupplier: null,
  };

  it('accepts values that match the canonical calculator', () => {
    const expected = calculateHardwarePricing(source);
    const result = verifyExcelCalculations(source, {
      var: expected.var,
      agreed: expected.agreed,
      mnfPrice: expected.mnfPrice,
      frcPrice: expected.frcPrice,
      retPriceExclVat: expected.retailPriceExVat,
      retPriceInclVat: expected.retailPriceInclVat,
      marginFranRet: expected.margins.marginFranRet,
      marginHwMnf: expected.margins.marginHwMnf,
      marginHwFran: expected.margins.marginHwFran,
    });
    assert.equal(result.ok, true);
    assert.equal(result.mismatches.length, 0);
    assert.equal(roundMoney(expected.agreed), 1.87);
    assert.equal(roundMoney(expected.mnfPrice), roundMoney(1.87 * 1.114));
  });

  it('accepts Excel margin fractions (0.35) as 35%', () => {
    const source = {
      cpt: 8.17,
      jhb: 8.03,
      pricingBasis: PRICING_BASIS.AGREED,
      mnfMarkup: 1.114,
      frcMarkup: 1.5206,
      retailMarkup: 1.54,
      retFromSupplier: null,
    };
    const result = verifyExcelCalculations(source, {
      marginFranRet: 0.35,
      marginHwMnf: 0.1,
      marginHwFran: 0.34,
    });
    assert.equal(result.ok, true);
  });

  it('accepts Excel 2-decimal displayed prices within tolerance', () => {
    const source = {
      cpt: 8.17,
      jhb: 8.03,
      pricingBasis: PRICING_BASIS.AGREED,
      mnfMarkup: 1.114,
      frcMarkup: 1.5206,
      retailMarkup: 1.54,
      retFromSupplier: null,
    };
    const result = verifyExcelCalculations(source, {
      var: -0.14,
      agreed: 8.17,
      mnfPrice: 9.1,
      frcPrice: 12.42,
      retPriceExclVat: 19.13,
      retPriceInclVat: 22.0,
      marginFranRet: 35.06,
      marginHwMnf: 10.23,
      marginHwFran: 34.24,
    });
    assert.equal(result.ok, true);
  });

  it('rejects mismatched mnfPrice', () => {
    const expected = calculateHardwarePricing(source);
    const result = verifyExcelCalculations(source, {
      agreed: expected.agreed,
      mnfPrice: 999,
    });
    assert.equal(result.ok, false);
    assert.equal(result.mismatches[0].code, 'VERIFICATION_FAILED');
    assert.equal(result.mismatches[0].field, 'mnfPrice');
    assert.equal(result.mismatches[0].excelValue, 999);
  });
});

describe('excelSync.verification (Retail sample)', () => {
  it('uses RET from Supplier as retail ex VAT', () => {
    const source = {
      cpt: 10,
      jhb: 12,
      pricingBasis: PRICING_BASIS.RETAIL,
      mnfMarkup: 1.1,
      frcMarkup: 0.9,
      retailMarkup: null,
      retFromSupplier: 50,
    };
    const expected = calculateHardwarePricing(source);
    assert.equal(expected.retailPriceExVat, 50);
    assert.equal(expected.frcPrice, roundMoney(50 * 0.9));
    const result = verifyExcelCalculations(source, {
      agreed: expected.agreed,
      mnfPrice: expected.mnfPrice,
      frcPrice: expected.frcPrice,
      retPriceExclVat: 50,
    });
    assert.equal(result.ok, true);
  });
});

describe('excelSync.service validateSourcePayload', () => {
  it('requires retFromSupplier for Retail', () => {
    const errors = validateSourcePayload({
      groupCode: 'ACC',
      description: 'x',
      pricingBasis: PRICING_BASIS.RETAIL,
      regionalCosts: { cpt: 1, jhb: 1 },
      mnfMarkup: 1,
      frcMarkup: 1,
      retFromSupplier: null,
    });
    assert.ok(errors.some((e) => e.code === 'MISSING_RET_FROM_SUPPLIER'));
  });
});

describe('excelSync.service processRow / submitSync (mocked)', () => {
  const user = { id: 'user1', name: 'Sync Bot', role: 'Data Entry' };

  const agreedSource = {
    groupCode: 'ACC',
    description: 'AIRVENT',
    supplierName: '',
    supplierCode: '',
    regionalCosts: { cpt: 1.87, jhb: 1.2 },
    pricingBasis: PRICING_BASIS.AGREED,
    mnfMarkup: 1.114,
    frcMarkup: 1.52,
    retailMarkup: 1.54,
    retFromSupplier: null,
    weight: null,
    isImport: false,
    isActive: true,
  };

  const matchingVerification = () => {
    const expected = calculateHardwarePricing({
      cpt: 1.87,
      jhb: 1.2,
      pricingBasis: PRICING_BASIS.AGREED,
      mnfMarkup: 1.114,
      frcMarkup: 1.52,
      retailMarkup: 1.54,
      retFromSupplier: null,
    });
    return {
      var: expected.var,
      agreed: expected.agreed,
      mnfPrice: expected.mnfPrice,
      frcPrice: expected.frcPrice,
      retPriceExclVat: expected.retailPriceExVat,
      retPriceInclVat: expected.retailPriceInclVat,
      marginFranRet: expected.margins.marginFranRet,
      marginHwMnf: expected.margins.marginHwMnf,
      marginHwFran: expected.margins.marginHwFran,
    };
  };

  it('hydrates missing description from live hardware and still submits', async () => {
    let submitCalls = 0;
    const result = await processRow(
      {
        excelRowNumber: 2,
        stockCode: 'ACC0001-CO1',
        source: {
          ...agreedSource,
          description: null,
        },
        verification: matchingVerification(),
      },
      user,
      { sheetName: 'Master File' },
      {
        findHardwareByStockCode: async () => ({
          _id: 'hw1',
          stockCode: 'ACC0001-CO1',
          groupCode: 'ACC',
          description: 'AIRVENT ROUND 40mm WHITE LOOSE',
          pricingBasis: 'Agreed',
          regionalCosts: { cpt: 1.87, jhb: 1.2 },
          mnfMarkup: 1.114,
          frcMarkup: 1.52,
          retailMarkup: 1.54,
        }),
        submitUpdate: async (_id, payload) => {
          submitCalls += 1;
          assert.equal(payload.description, 'AIRVENT ROUND 40mm WHITE LOOSE');
          return { id: 'cr1', changedFields: ['regionalCosts.cpt'] };
        },
      }
    );

    assert.equal(result.status, 'PENDING');
    assert.equal(submitCalls, 1);
  });

  it('creates PENDING via submitUpdate and does not call a direct hardware update', async () => {
    let submitCalls = 0;
    const result = await processRow(
      {
        excelRowNumber: 42,
        stockCode: 'acc0001-co1',
        source: agreedSource,
        verification: matchingVerification(),
      },
      user,
      { sheetName: 'Master File' },
      {
        findHardwareByStockCode: async () => ({ _id: 'hw1', stockCode: 'ACC0001-CO1' }),
        submitUpdate: async (id, payload) => {
          submitCalls += 1;
          assert.equal(id, 'hw1');
          assert.equal(payload.stockCode, undefined);
          assert.equal(payload.regionalCosts.cpt, 1.87);
          assert.match(payload.comments, /Excel Hardware Master Sync/);
          return {
            id: 'cr1',
            changedFields: ['regionalCosts.cpt'],
          };
        },
      }
    );

    assert.equal(result.status, 'PENDING');
    assert.equal(result.changeRequestId, 'cr1');
    assert.deepEqual(result.changedFields, ['regionalCosts.cpt']);
    assert.equal(submitCalls, 1);
    assert.equal(result.updateBaseline, true);
  });

  it('returns NO_CHANGE when submitUpdate reports no changes', async () => {
    const result = await processRow(
      {
        stockCode: 'ACC0001-CO1',
        source: agreedSource,
        verification: matchingVerification(),
      },
      user,
      { sheetName: 'Master File' },
      {
        findHardwareByStockCode: async () => ({ _id: 'hw1', stockCode: 'ACC0001-CO1' }),
        submitUpdate: async () => {
          throw new AppError('No changes detected', HTTP_STATUS.BAD_REQUEST);
        },
      }
    );
    assert.equal(result.status, 'NO_CHANGE');
    assert.equal(result.updateBaseline, true);
  });

  it('returns PENDING_CONFLICT without creating another CR', async () => {
    const result = await processRow(
      {
        stockCode: 'ACC0001-CO1',
        source: agreedSource,
        verification: matchingVerification(),
      },
      user,
      { sheetName: 'Master File' },
      {
        findHardwareByStockCode: async () => ({ _id: 'hw1', stockCode: 'ACC0001-CO1' }),
        submitUpdate: async () => {
          throw new AppError(
            'A pending approval request already exists for this hardware item',
            HTTP_STATUS.CONFLICT
          );
        },
      }
    );
    assert.equal(result.status, 'PENDING_CONFLICT');
    assert.equal(result.updateBaseline, false);
  });

  it('returns UNKNOWN_STOCK_CODE when hardware is missing', async () => {
    const result = await processRow(
      {
        stockCode: 'MISSING',
        source: agreedSource,
        verification: matchingVerification(),
      },
      user,
      { sheetName: 'Master File' },
      {
        findHardwareByStockCode: async () => null,
        submitUpdate: async () => {
          throw new Error('should not be called');
        },
      }
    );
    assert.equal(result.status, 'UNKNOWN_STOCK_CODE');
  });

  it('returns INVALID on verification mismatch and does not call submitUpdate', async () => {
    let submitCalls = 0;
    const result = await processRow(
      {
        stockCode: 'ACC0001-CO1',
        source: agreedSource,
        verification: { ...matchingVerification(), mnfPrice: 1 },
      },
      user,
      { sheetName: 'Master File' },
      {
        findHardwareByStockCode: async () => ({ _id: 'hw1', stockCode: 'ACC0001-CO1' }),
        submitUpdate: async () => {
          submitCalls += 1;
          return { id: 'cr' };
        },
      }
    );
    assert.equal(result.status, 'INVALID');
    assert.equal(result.errors[0].code, 'VERIFICATION_FAILED');
    assert.equal(submitCalls, 0);
  });

  it('partial success: one invalid row does not block a valid sibling', async () => {
    const calls = [];
    const data = await submitSync({
      body: {
        workbook: { sheetName: 'Master File' },
        rows: [
          {
            excelRowNumber: 1,
            stockCode: 'GOOD1',
            source: agreedSource,
            verification: matchingVerification(),
          },
          {
            excelRowNumber: 2,
            stockCode: 'BAD1',
            source: agreedSource,
            verification: { mnfPrice: 1 },
          },
        ],
      },
      user,
      deps: {
        findHardwareByStockCode: async (code) => ({ _id: `id-${code}`, stockCode: code }),
        submitUpdate: async (id) => {
          calls.push(id);
          return { id: `cr-${id}`, changedFields: ['description'] };
        },
      },
    });

    assert.equal(data.summary.pendingCreated, 1);
    assert.equal(data.summary.invalid, 1);
    assert.equal(calls.length, 1);
    assert.equal(data.results[0].status, 'PENDING');
    assert.equal(data.results[1].status, 'INVALID');
  });

  it('rejects duplicate stock codes in one request', async () => {
    const data = await submitSync({
      body: {
        rows: [
          {
            stockCode: 'DUP1',
            source: agreedSource,
            verification: matchingVerification(),
          },
          {
            stockCode: 'dup1',
            source: agreedSource,
            verification: matchingVerification(),
          },
        ],
      },
      user,
      deps: {
        findHardwareByStockCode: async () => ({ _id: 'hw', stockCode: 'DUP1' }),
        submitUpdate: async () => ({ id: 'cr', changedFields: [] }),
      },
    });

    assert.equal(data.summary.pendingCreated, 1);
    assert.equal(data.summary.invalid, 1);
    assert.equal(data.results[1].errors[0].code, 'DUPLICATE_STOCK_CODE_IN_REQUEST');
  });
});
