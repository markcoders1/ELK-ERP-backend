const { PRICING_BASIS } = require('../../config/constants');

/**
 * Hardware Master File column aliases (case-insensitive, trimmed).
 * Extra Excel columns are ignored. Calculated columns are recognized
 * but not persisted — Pricing Engine owns those later.
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
  agreedPrice: ['AGREED'],
  pricingBasis: ['PRICING BASIS', 'PRICINGBASIS', 'PRICING CATEGORY', 'PRICINGCATEGORY', 'BASIS'],
  mnfMarkup: ['MNF MARKUP', 'MNFMARKUP', 'MANUFACTURING MARKUP'],
  mnfPrice: ['MNF PRICE', 'MNFPRICE', 'MANUFACTURING', 'MANUFACTURING PRICE'],
  frcMarkup: ['FRC MARKUP', 'FRC MARK UP / DISCOUNT', 'FRC MARK UP', 'FRCMARKUP', 'FRANCHISE MARKUP'],
  frcBase: ['FRC BASE', 'FRCBASE'],
  frcPrice: ['FRC PRICE', 'FRCPRICE', 'FRANCHISE', 'FRANCHISE PRICE'],
  retailMarkup: ['RET MARKUP', 'RETAIL MARKUP', 'RETMARKUP'],
  retailExclVat: ['RET PRICE EXCL VAT', 'RET PRICE EXCL.', 'RETAIL EXCL VAT', 'RETAIL'],
  retailInclVat: ['RET PRICE INCL VAT', 'RET PRICE INCL.', 'RETAIL INCL VAT'],
  retFromSupplier: ['RET FROM SUPPLIER', 'RET FROM SUPPLIER', 'RETAIL FROM SUPPLIER'],
  marginFranRet: ['MARGIN FRAN / RET', 'MARGIN FRAN/RET'],
  marginHwMnf: ['MARGIN HW / MNF', 'MARGIN HW/MNF'],
  marginHwFran: ['MARGIN HW / FRAN', 'MARGIN HW/FRAN'],
  isImport: ['IMPORT', 'IMPORT FILE', 'IMPORTFILE'],
  weight: ['WEIGHT'],
  isActive: ['ACTIVE', 'STATUS'],
};

/** Calculated / display-only columns — imported for visibility, never stored as source. */
const CALCULATED_FIELDS = new Set([
  'var',
  'agreedPrice',
  'mnfPrice',
  'frcBase',
  'frcPrice',
  'retailExclVat',
  'retailInclVat',
  'marginFranRet',
  'marginHwMnf',
  'marginHwFran',
]);

const normalizeHeaderKey = (header) =>
  String(header || '')
    .normalize('NFKC')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .trim()
    .replace(/\s+/g, ' ')
    .toUpperCase();

const buildHeaderLookup = (headers = []) => {
  const aliasToField = new Map();
  Object.entries(COLUMN_ALIASES).forEach(([field, aliases]) => {
    aliases.forEach((alias) => {
      aliasToField.set(normalizeHeaderKey(alias), field);
    });
  });

  const lookup = {};
  headers.forEach((header) => {
    const key = normalizeHeaderKey(header);
    const field = aliasToField.get(key);
    if (field) {
      lookup[field] = header;
    }
  });
  return lookup;
};

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
 * Tolerant currency / number parsing.
 * R120 | 120 | 120.00 | 120,00 | 1 234.56 → number
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

  // European decimal comma when no dot present: 120,00
  if (text.includes(',') && !text.includes('.')) {
    text = text.replace(',', '.');
  } else {
    // Remove thousand separators
    text = text.replace(/,/g, '');
  }

  text = text.replace(/[^0-9.+-]/g, '');
  if (!text || text === '-' || text === '+' || text === '.') return null;

  const number = Number(text);
  return Number.isFinite(number) ? number : null;
};

const TRUE_VALUES = new Set([
  'TRUE',
  'YES',
  'Y',
  '1',
  'ACTIVE',
  'IMPORT',
]);

const FALSE_VALUES = new Set([
  'FALSE',
  'NO',
  'N',
  '0',
  'INACTIVE',
  'DISABLED',
]);

const normalizeBoolean = (value, { defaultValue = null } = {}) => {
  if (value === null || value === undefined || value === '') return defaultValue;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (value === 1) return true;
    if (value === 0) return false;
    return defaultValue;
  }

  const text = stripInvisible(value).toUpperCase();
  if (!text) return defaultValue;
  if (TRUE_VALUES.has(text)) return true;
  if (FALSE_VALUES.has(text)) return false;
  return defaultValue;
};

/**
 * Map to persisted pricingBasis enum values (Agreed / Retail).
 */
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

const getRawField = (raw, lookup, field) => {
  const header = lookup[field];
  if (!header) return undefined;
  return raw[header];
};

/**
 * Normalize one Excel raw row into a Hardware source payload + notes.
 * Does not enforce business rules (validator owns that).
 */
const normalizeHardwareRow = (raw, headers) => {
  const lookup = buildHeaderLookup(headers);
  const infos = [];

  const groupCode = normalizeString(getRawField(raw, lookup, 'groupCode'), { uppercase: true });
  const stockCode = normalizeString(getRawField(raw, lookup, 'stockCode'), { uppercase: true });
  const description = normalizeString(getRawField(raw, lookup, 'description'));
  const supplierName = normalizeString(getRawField(raw, lookup, 'supplierName'));
  const supplierCode = normalizeString(getRawField(raw, lookup, 'supplierCode'));

  const cpt = normalizeNumber(getRawField(raw, lookup, 'cpt'));
  const jhb = normalizeNumber(getRawField(raw, lookup, 'jhb'));
  const mnfMarkup = normalizeNumber(getRawField(raw, lookup, 'mnfMarkup'));
  const frcMarkup = normalizeNumber(getRawField(raw, lookup, 'frcMarkup'));
  const retailMarkup = normalizeNumber(getRawField(raw, lookup, 'retailMarkup'));
  const weight = normalizeNumber(getRawField(raw, lookup, 'weight'));

  let pricingBasis = normalizePricingBasis(getRawField(raw, lookup, 'pricingBasis'));
  let agreedUsedAsPricingBasis = false;

  // Master File has no "Pricing Basis" column — FRC Base (Agreed / Retail) is the switch.
  if (!pricingBasis && lookup.frcBase) {
    pricingBasis = normalizePricingBasis(getRawField(raw, lookup, 'frcBase'));
  }

  // Some sheets store Agreed/Retail text in the AGREED column instead of a price.
  if (!pricingBasis && lookup.agreedPrice) {
    const agreedRaw = getRawField(raw, lookup, 'agreedPrice');
    const asBasis = normalizePricingBasis(agreedRaw);
    if (asBasis) {
      pricingBasis = asBasis;
      agreedUsedAsPricingBasis = true;
    }
  }

  if (!pricingBasis) {
    pricingBasis = PRICING_BASIS.AGREED;
    infos.push({
      severity: 'INFO',
      code: 'PRICING_BASIS_DEFAULTED',
      message: 'Pricing Basis / FRC Base missing — defaulted to Agreed',
    });
  }

  const isImport = normalizeBoolean(getRawField(raw, lookup, 'isImport'), { defaultValue: false });
  const isActive = normalizeBoolean(getRawField(raw, lookup, 'isActive'), { defaultValue: true });

  CALCULATED_FIELDS.forEach((field) => {
    if (!lookup[field]) return;
    if (field === 'agreedPrice' && agreedUsedAsPricingBasis) return;
    const value = emptyToNull(getRawField(raw, lookup, field));
    if (value != null) {
      infos.push({
        severity: 'INFO',
        code: 'CALCULATED_IGNORED',
        message: `${field} displayed value ignored (Pricing Engine will own calculations)`,
      });
    }
  });

  const retFromSupplier = normalizeNumber(getRawField(raw, lookup, 'retFromSupplier'));

  const payload = {
    groupCode,
    stockCode,
    description,
    supplierName: supplierName || '',
    supplierCode: supplierCode || '',
    regionalCosts: {
      cpt,
      jhb,
    },
    pricingBasis,
    mnfMarkup,
    frcMarkup,
    retailMarkup,
    retFromSupplier,
    weight,
    isImport: Boolean(isImport),
    isActive: isActive !== false,
  };

  return {
    payload,
    infos,
    lookup,
  };
};

module.exports = {
  COLUMN_ALIASES,
  CALCULATED_FIELDS,
  buildHeaderLookup,
  normalizeHardwareRow,
  normalizeNumber,
  normalizeBoolean,
  normalizePricingBasis,
  normalizeString,
  normalizeHeaderKey,
};
