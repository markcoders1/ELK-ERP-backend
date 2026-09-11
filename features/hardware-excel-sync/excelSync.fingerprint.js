/**
 * Canonical source fingerprint for Hardware Excel Sync change detection.
 * Must stay in sync with office-scripts/HardwareMasterExcelSync.ts
 *
 * Fingerprint uses mutable source fields only — never calculated prices/margins.
 */

const SOURCE_FINGERPRINT_FIELDS = [
  'groupCode',
  'description',
  'supplierName',
  'supplierCode',
  'cpt',
  'jhb',
  'pricingBasis',
  'mnfMarkup',
  'frcMarkup',
  'retailMarkup',
  'retFromSupplier',
  'weight',
  'isImport',
  'isActive',
];

const normalizeFingerprintString = (value) => {
  if (value === null || value === undefined) return '';
  return String(value)
    .normalize('NFKC')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
};

const normalizeFingerprintNumber = (value) => {
  if (value === null || value === undefined || value === '') return '';
  const number = Number(value);
  if (!Number.isFinite(number)) return '';
  // Stable canonical form (avoid 1.1140000001 noise)
  return String(Math.round(number * 1e8) / 1e8);
};

const normalizeFingerprintBoolean = (value) => {
  if (value === true || value === false) return value ? '1' : '0';
  return '';
};

/**
 * @param {object} source — flat or nested regionalCosts source object
 * @returns {string} deterministic fingerprint
 */
const buildSourceFingerprint = (source = {}) => {
  const regional = source.regionalCosts || {};
  const flat = {
    groupCode: normalizeFingerprintString(source.groupCode),
    description: normalizeFingerprintString(source.description),
    supplierName: normalizeFingerprintString(source.supplierName),
    supplierCode: normalizeFingerprintString(source.supplierCode),
    cpt: normalizeFingerprintNumber(source.cpt ?? regional.cpt),
    jhb: normalizeFingerprintNumber(source.jhb ?? regional.jhb),
    pricingBasis: normalizeFingerprintString(source.pricingBasis),
    mnfMarkup: normalizeFingerprintNumber(source.mnfMarkup),
    frcMarkup: normalizeFingerprintNumber(source.frcMarkup),
    retailMarkup: normalizeFingerprintNumber(source.retailMarkup),
    retFromSupplier: normalizeFingerprintNumber(source.retFromSupplier),
    weight: normalizeFingerprintNumber(source.weight),
    isImport: normalizeFingerprintBoolean(source.isImport),
    isActive: normalizeFingerprintBoolean(source.isActive),
  };

  return SOURCE_FINGERPRINT_FIELDS.map((key) => `${key}=${flat[key]}`).join('|');
};

module.exports = {
  SOURCE_FINGERPRINT_FIELDS,
  buildSourceFingerprint,
  normalizeFingerprintString,
  normalizeFingerprintNumber,
  normalizeFingerprintBoolean,
};
