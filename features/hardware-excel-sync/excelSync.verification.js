const {
  calculateHardwarePricing,
} = require('../hardware/hardwarePricing.service');

/**
 * Compare Excel verification values against canonical hardwarePricing.service.
 * Money: 4 dp. Margins: 2 dp. Omitted verification fields are skipped.
 */

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
  const round = kind === 'percent' ? roundPercent : roundMoney;
  const excel = excelRaw === '' || excelRaw === undefined ? null : round(excelRaw);
  const expected = expectedRaw === '' || expectedRaw === undefined ? null : round(expectedRaw);

  if (excel === null && expected === null) return true;
  if (excel === null || expected === null) return false;
  return excel === expected;
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
        excelValue: excelRaw === '' ? null : round(excelRaw),
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
  roundMoney,
  roundPercent,
  valuesMatch,
};
