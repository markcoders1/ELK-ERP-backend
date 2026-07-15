require('dotenv').config();
const fs = require('fs');
const path = require('path');
const connectDatabase = require('../config/database');
const HardwareItem = require('../features/hardware/hardwareItem.model');
const { ALL_PRICING_BASIS } = require('../config/constants');

const SEED_FILE = path.join(__dirname, 'data', 'hardware.seed.json');

const isNonEmptyString = (value) => typeof value === 'string' && value.trim().length > 0;

const isNonNegativeNumber = (value) => typeof value === 'number' && !Number.isNaN(value) && value >= 0;

const validateSeedItem = (item, index) => {
  const label = `Item[${index}]`;

  if (!item || typeof item !== 'object' || Array.isArray(item)) {
    throw new Error(`${label}: must be an object`);
  }

  if (!isNonEmptyString(item.groupCode)) {
    throw new Error(`${label}: groupCode is required`);
  }

  if (!isNonEmptyString(item.stockCode)) {
    throw new Error(`${label}: stockCode is required`);
  }

  if (!isNonEmptyString(item.description)) {
    throw new Error(`${label}: description is required`);
  }

  if (!item.regionalCosts || typeof item.regionalCosts !== 'object') {
    throw new Error(`${label} (${item.stockCode}): regionalCosts is required`);
  }

  if (
    item.regionalCosts.agreed !== undefined &&
    item.regionalCosts.agreed !== null &&
    !isNonNegativeNumber(item.regionalCosts.agreed)
  ) {
    throw new Error(`${label} (${item.stockCode}): regionalCosts.agreed must be a number >= 0`);
  }

  if (
    item.mnfMarkup !== undefined &&
    item.mnfMarkup !== null &&
    (!isNonNegativeNumber(item.mnfMarkup) || item.mnfMarkup <= 0)
  ) {
    throw new Error(`${label} (${item.stockCode}): mnfMarkup must be a positive number`);
  }

  if (
    item.frcMarkup !== undefined &&
    item.frcMarkup !== null &&
    (!isNonNegativeNumber(item.frcMarkup) || item.frcMarkup <= 0)
  ) {
    throw new Error(`${label} (${item.stockCode}): frcMarkup must be a positive number`);
  }

  if (
    item.retailMarkup !== undefined &&
    item.retailMarkup !== null &&
    (!isNonNegativeNumber(item.retailMarkup) || item.retailMarkup <= 0)
  ) {
    throw new Error(`${label} (${item.stockCode}): retailMarkup must be a positive number`);
  }

  if (
    item.weight !== undefined &&
    item.weight !== null &&
    !isNonNegativeNumber(item.weight)
  ) {
    throw new Error(`${label} (${item.stockCode}): weight must be a number >= 0`);
  }

  if (
    item.regionalCosts.cpt !== undefined &&
    item.regionalCosts.cpt !== null &&
    !isNonNegativeNumber(item.regionalCosts.cpt)
  ) {
    throw new Error(`${label} (${item.stockCode}): regionalCosts.cpt must be a number >= 0`);
  }

  if (
    item.regionalCosts.jhb !== undefined &&
    item.regionalCosts.jhb !== null &&
    !isNonNegativeNumber(item.regionalCosts.jhb)
  ) {
    throw new Error(`${label} (${item.stockCode}): regionalCosts.jhb must be a number >= 0`);
  }

  if (!ALL_PRICING_BASIS.includes(item.pricingBasis)) {
    throw new Error(
      `${label} (${item.stockCode}): pricingBasis must be one of: ${ALL_PRICING_BASIS.join(', ')}`
    );
  }

  if (item.isImport !== undefined && typeof item.isImport !== 'boolean') {
    throw new Error(`${label} (${item.stockCode}): isImport must be a boolean`);
  }

  if (item.isActive !== undefined && typeof item.isActive !== 'boolean') {
    throw new Error(`${label} (${item.stockCode}): isActive must be a boolean`);
  }
};

const loadSeedData = () => {
  if (!fs.existsSync(SEED_FILE)) {
    throw new Error(`Seed file not found: ${SEED_FILE}`);
  }

  const raw = fs.readFileSync(SEED_FILE, 'utf8');
  const data = JSON.parse(raw);

  if (!Array.isArray(data)) {
    throw new Error('Seed file must contain a JSON array');
  }

  if (data.length === 0) {
    throw new Error('Seed file is empty');
  }

  const stockCodes = new Set();

  data.forEach((item, index) => {
    validateSeedItem(item, index);

    const stockCode = item.stockCode.trim().toUpperCase();
    if (stockCodes.has(stockCode)) {
      throw new Error(`Duplicate stockCode in seed file: ${stockCode}`);
    }
    stockCodes.add(stockCode);
  });

  return data;
};

const seedHardware = async () => {
  const items = loadSeedData();

  await connectDatabase();

  let inserted = 0;
  let skipped = 0;

  for (const item of items) {
    const stockCode = item.stockCode.trim().toUpperCase();
    const existing = await HardwareItem.findOne({ stockCode }).lean();

    if (existing) {
      skipped += 1;
      continue;
    }

    await HardwareItem.create({
      groupCode: item.groupCode.trim().toUpperCase(),
      stockCode,
      description: item.description.trim(),
      supplierName: item.supplierName ? String(item.supplierName).trim() : '',
      supplierCode: item.supplierCode ? String(item.supplierCode).trim() : '',
      regionalCosts: {
        cpt: item.regionalCosts.cpt,
        jhb: item.regionalCosts.jhb,
        agreed: item.regionalCosts.agreed,
      },
      pricingBasis: item.pricingBasis,
      mnfMarkup: item.mnfMarkup,
      frcMarkup: item.frcMarkup,
      retailMarkup: item.retailMarkup,
      weight: item.weight,
      isImport: item.isImport ?? false,
      isActive: item.isActive ?? true,
    });

    inserted += 1;
  }

  console.log(`Inserted: ${inserted}`);
  console.log(`Skipped: ${skipped}`);
  process.exit(0);
};

seedHardware().catch((error) => {
  console.error('Hardware seed failed:', error.message);
  process.exit(1);
});
