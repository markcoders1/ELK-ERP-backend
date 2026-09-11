const {
  calculateHardwarePricing,
} = require('../hardware/hardwarePricing.service');

/**
 * Compare Excel verification values against canonical hardwarePricing.service.
 *
 * Excel Master File cells are usually displayed / exported at ~2 dp, while the
 * canonical engine stores money at 4 dp. Exact equality therefore rejects
 * legitimate rows. Use absolute tolerances instead.
 */

const MONEY_TOLERANCE = 0.01;
const PERCENT_TOLERANCE = 0.05;

const roundMoney = (value) => {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return null;
  return Math.round(Number(value) * 10000) / 10000;
};

const roundPercent = (value) => {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return null;
  return Math.round(Number(value) * 100) / 100;
};

const VERIFICATION_FIELD_MAP = [
  { excelKey: 'var', expectedPath: 'var', kind: 'money' },
  { excelKey: 'agreed', expectedPath: 'agreed', kind: 'money' },
  { excelKey: 'mnfPrice', expectedPath: 'mnfPrice', kind: 'money' },
  { excelKey: 'frcPrice', expectedPath: 'frcPrice', kind: 'money' },
  {
    excelKey: 'retPriceExclVat',
    expectedPath: 'retailPriceExVat',
    kind: 'money',
    aliases: ['retailPriceExVat'],
  },
  {
    excelKey: 'retPriceInclVat',
    expectedPath: 'retailPriceInclVat',
    kind: 'money',
    aliases: ['retailPriceInclVat'],
  },
  {
    excelKey: 'marginFranRet',
    expectedPath: 'margins.marginFranRet',
    kind: 'percent',
  },
  {
    excelKey: 'marginHwMnf',
    expectedPath: 'margins.marginHwMnf',
    kind: 'percent',
  },
  {
    excelKey: 'marginHwFran',
    expectedPath: 'margins.marginHwFran',
    kind: 'percent',
  },
];

const getPath = (obj, path) =>
  path.split('.').reduce((acc, key) => (acc == null ? undefined : acc[key]), obj);

const pickExcelValue = (verification, field) => {
  if (!verification || typeof verification !== 'object') return undefined;
  if (Object.prototype.hasOwnProperty.call(verification, field.excelKey)) {
    return verification[field.excelKey];
  }
  if (field.aliases) {
    for (const alias of field.aliases) {
      if (Object.prototype.hasOwnProperty.call(verification, alias)) {
        return verification[alias];
      }
    }
  }
  return undefined;
};

const valuesMatch = (excelRaw, expectedRaw, kind) => {
  const excelNum =
    excelRaw === '' || excelRaw === undefined || excelRaw === null
      ? null
      : Number(excelRaw);
  const expectedNum =
    expectedRaw === '' || expectedRaw === undefined || expectedRaw === null
      ? null
      : Number(expectedRaw);

  if (excelNum === null && expectedNum === null) return true;
  if (excelNum === null || expectedNum === null) return false;
  if (!Number.isFinite(excelNum) || !Number.isFinite(expectedNum)) return false;

  const tolerance = kind === 'percent' ? PERCENT_TOLERANCE : MONEY_TOLERANCE;
  return Math.abs(excelNum - expectedNum) <= tolerance;
};

/**
 * @param {object} sourceInput — fields accepted by calculateHardwarePricing
 * @param {object} verification — Excel calculated reference values
 * @returns {{ ok: boolean, expected: object, mismatches: Array<object> }}
 */
const verifyExcelCalculations = (sourceInput, verification = {}) => {
  const expected = calculateHardwarePricing(sourceInput);
  const mismatches = [];

  VERIFICATION_FIELD_MAP.forEach((field) => {
    const excelRaw = pickExcelValue(verification, field);
    // Omitted or blank Excel cells are not compared (non-applicable / empty display).
    if (excelRaw === undefined || excelRaw === null || excelRaw === '') return;

    const expectedRaw = getPath(expected, field.expectedPath);
    if (!valuesMatch(excelRaw, expectedRaw, field.kind)) {
      const round = field.kind === 'percent' ? roundPercent : roundMoney;
      mismatches.push({
        code: 'VERIFICATION_FAILED',
        field: field.excelKey,
        excelValue: round(excelRaw),
        expectedValue: expectedRaw == null ? null : round(expectedRaw),
        message: 'Excel calculated value does not match canonical pricing calculation',
      });
    }
  });

  return {
    ok: mismatches.length === 0,
    expected,
    mismatches,
  };
};

module.exports = {
  verifyExcelCalculations,
  VERIFICATION_FIELD_MAP,
  MONEY_TOLERANCE,
  PERCENT_TOLERANCE,
  roundMoney,
  roundPercent,
  valuesMatch,
};
