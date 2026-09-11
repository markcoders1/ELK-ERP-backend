const { PRICING_BASIS } = require('../../config/constants');

/**
 * Header aliases aligned with hardware-import/normalizer.js (compatible subset).
 * Excel Sync does not change import behavior — this is a parallel alias map.
 */

const COLUMN_ALIASES = {
  groupCode: ['GROUP', 'GROUP CODE', 'GROUPCODE'],
  stockCode: ['STOCK CODE', 'STOCKCODE', 'STOCK', 'CODE'],
  supplierName: ['SUPPLIER', 'SUPPLIER NAME', 'SUPPLIERNAME'],
  supplierCode: ['SUPPLIER CODE', 'SUPPLIERCODE'],
  description: ['DESCRIPTION', 'DESC'],
  cpt: ['CPT'],
  jhb: ['JHB'],
  var: ['VAR'],
  agreed: ['AGREED'],
  pricingBasis: ['PRICING BASIS', 'PRICINGBASIS', 'PRICING CATEGORY', 'BASIS'],
  mnfMarkup: ['MNF MARKUP', 'MNFMARKUP', 'MANUFACTURING MARKUP'],
  mnfPrice: ['MNF PRICE', 'MNFPRICE', 'MANUFACTURING PRICE', 'MANUFACTURING'],
  frcMarkup: [
    'FRC MARKUP',
    'FRC MARK UP / DISCOUNT',
    'FRC MARK UP',
    'FRCMARKUP',
    'FRANCHISE MARKUP',
  ],
  frcBase: ['FRC BASE', 'FRCBASE'],
  frcPrice: ['FRC PRICE', 'FRCPRICE', 'FRANCHISE PRICE', 'FRANCHISE'],
  retailMarkup: ['RET MARKUP', 'RETAIL MARKUP', 'RETMARKUP'],
  retailPriceExVat: [
    'RET PRICE EXCL VAT',
    'RET PRICE EXCL.',
    'RETAIL EXCL VAT',
    'RET PRICE EXCL VAT',
    'RETAIL',
  ],
  retailPriceInclVat: [
    'RET PRICE INCL VAT',
    'RET PRICE INCL.',
    'RETAIL INCL VAT',
  ],
  retFromSupplier: ['RET FROM SUPPLIER', 'RETAIL FROM SUPPLIER'],
  marginFranRet: ['MARGIN FRAN / RET', 'MARGIN FRAN/RET'],
  marginHwMnf: ['MARGIN HW / MNF', 'MARGIN HW/MNF'],
  marginHwFran: ['MARGIN HW / FRAN', 'MARGIN HW/FRAN'],
  isImport: ['IMPORT', 'IMPORT FILE', 'IMPORTFILE'],
  weight: ['WEIGHT'],
  isActive: ['ACTIVE', 'STATUS'],
};

const CALCULATED_FIELDS = new Set([
  'var',
  'agreed',
  'mnfPrice',
  'frcPrice',
  'retailPriceExVat',
  'retailPriceInclVat',
  'marginFranRet',
  'marginHwMnf',
  'marginHwFran',
  'frcBase',
]);

const normalizeHeaderKey = (header) =>
  String(header || '')
    .normalize('NFKC')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/[\r\n]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
    .toUpperCase();

const stripInvisible = (value) =>
  String(value)
    .normalize('NFKC')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

const emptyToNull = (value) => {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string' && stripInvisible(value) === '') return null;
  return value;
};

/**
 * Tolerant number parse (aligned with import normalizer).
 * Also handles accounting parentheses: (0.67) → -0.67
 */
const normalizeNumber = (value) => {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  if (value instanceof Date) return null;

  let text = stripInvisible(value);
  if (!text) return null;

  text = text.replace(/^R\s*/i, '');
  text = text.replace(/\s/g, '');

  const paren = text.match(/^\((.+)\)$/);
  if (paren) {
    text = `-${paren[1]}`;
  }

  if (text.includes(',') && !text.includes('.')) {
    text = text.replace(',', '.');
  } else {
    text = text.replace(/,/g, '');
  }

  text = text.replace(/[^0-9.+-]/g, '');
  if (!text || text === '-' || text === '+' || text === '.') return null;

  const number = Number(text);
  return Number.isFinite(number) ? number : null;
};

const TRUE_VALUES = new Set(['TRUE', 'YES', 'Y', '1', 'ACTIVE', 'IMPORT']);
const FALSE_VALUES = new Set(['FALSE', 'NO', 'N', '0', 'INACTIVE', 'DISABLED']);

/**
 * Strict boolean: unrecognized non-blank → throws { code: 'INVALID_BOOLEAN' }
 */
const normalizeBooleanStrict = (value, { defaultValue = null } = {}) => {
  if (value === null || value === undefined || value === '') return defaultValue;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (value === 1) return true;
    if (value === 0) return false;
    const err = new Error('Unrecognized boolean value');
    err.code = 'INVALID_BOOLEAN';
    throw err;
  }

  const text = stripInvisible(value).toUpperCase();
  if (!text) return defaultValue;
  if (TRUE_VALUES.has(text)) return true;
  if (FALSE_VALUES.has(text)) return false;

  const err = new Error(`Unrecognized boolean value: ${text}`);
  err.code = 'INVALID_BOOLEAN';
  throw err;
};

const normalizePricingBasis = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const text = stripInvisible(value).toUpperCase();
  if (text === 'AGREED' || text === 'A') return PRICING_BASIS.AGREED;
  if (text === 'RETAIL' || text === 'R' || text === 'RET') return PRICING_BASIS.RETAIL;
  return null;
};

const normalizeString = (value, { uppercase = false } = {}) => {
  const emptied = emptyToNull(value);
  if (emptied == null) return null;
  if (typeof emptied === 'number' || typeof emptied === 'boolean') {
    const asText = stripInvisible(String(emptied));
    return uppercase ? asText.toUpperCase() : asText;
  }
  if (emptied instanceof Date) return null;
  const text = stripInvisible(emptied);
  if (!text) return null;
  return uppercase ? text.toUpperCase() : text;
};

/**
 * Build update payload for submitUpdate (no stockCode).
 * Follows manual update semantics: explicit nulls for blank numbers.
 */
const buildSubmitUpdatePayload = (source = {}, { excelRowNumber, sheetName } = {}) => {
  const regional = source.regionalCosts || {};

  const payload = {
    groupCode: source.groupCode,
    description: source.description,
    supplierName: source.supplierName ?? '',
    supplierCode: source.supplierCode ?? '',
    regionalCosts: {
      cpt: source.cpt !== undefined ? source.cpt : regional.cpt ?? null,
      jhb: source.jhb !== undefined ? source.jhb : regional.jhb ?? null,
    },
    pricingBasis: source.pricingBasis,
    mnfMarkup: source.mnfMarkup,
    frcMarkup: source.frcMarkup,
    retailMarkup: source.retailMarkup ?? null,
    retFromSupplier: source.retFromSupplier ?? null,
    weight: source.weight ?? null,
    isImport: Boolean(source.isImport),
    isActive: source.isActive !== false,
    comments: [
      'Submitted via Excel Hardware Master Sync',
      `Sheet: ${sheetName || 'Master File'}`,
      excelRowNumber != null ? `Excel row: ${excelRowNumber}` : null,
    ]
      .filter(Boolean)
      .join('\n'),
  };

  return payload;
};

module.exports = {
  COLUMN_ALIASES,
  CALCULATED_FIELDS,
  normalizeHeaderKey,
  normalizeNumber,
  normalizeBooleanStrict,
  normalizePricingBasis,
  normalizeString,
  buildSubmitUpdatePayload,
  emptyToNull,
};
