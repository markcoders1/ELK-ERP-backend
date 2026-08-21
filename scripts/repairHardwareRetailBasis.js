/**
 * Re-apply Master File source fields for pricing basis / RET from Supplier / markups.
 *
 * Excel has no "Pricing Basis" column — FRC Base (Agreed | Retail) is the switch.
 * Does not change pricing formulas; only corrects imported source inputs.
 *
 * Usage (from server/):
 *   node scripts/repairHardwareRetailBasis.js
 */

require('dotenv').config();
const fs = require('fs');
const mongoose = require('mongoose');
const connectDatabase = require('../config/database');
const { parseWorkbook } = require('../features/hardware-import/excel.parser');
const { normalizeHardwareRow } = require('../features/hardware-import/normalizer');
const HardwareItem = require('../features/hardware/hardwareItem.model');
const {
  calculateHardwarePricing,
  DEFAULT_MARKUP,
} = require('../features/hardware/hardwarePricing.service');
const hardwareItemRangeService = require('../features/hardware-item-range/hardwareItemRange.service');
const { PRICING_BASIS } = require('../config/constants');

const DEFAULT_HW_PATH =
  process.env.HW_XLSX_PATH ||
  '/home/syed-ahad/Downloads/Hardware Master File_National_01102023 (2).xlsx';

const resolveRetailMarkup = (raw, pricingBasis) => {
  if (raw !== null && raw !== undefined && Number.isFinite(Number(raw))) {
    return Number(raw);
  }
  return pricingBasis === PRICING_BASIS.RETAIL ? null : DEFAULT_MARKUP;
};

const main = async () => {
  const filePath = DEFAULT_HW_PATH;
  if (!fs.existsSync(filePath)) {
    throw new Error(`Hardware workbook not found: ${filePath}`);
  }

  await connectDatabase();

  const buffer = fs.readFileSync(filePath);
  const { selectedSheet } = parseWorkbook(buffer, { sheetName: 'Master File' });

  let updated = 0;
  let retail = 0;
  let agreed = 0;
  let missing = 0;

  // eslint-disable-next-line no-restricted-syntax
  for (const row of selectedSheet.rows) {
    const { payload } = normalizeHardwareRow(row.raw || row, selectedSheet.headers);
    if (!payload.stockCode) continue;

    // eslint-disable-next-line no-await-in-loop
    const item = await HardwareItem.findOne({
      stockCode: payload.stockCode,
      deletedAt: null,
    });
    if (!item) {
      missing += 1;
      continue;
    }

    const pricingBasis = payload.pricingBasis || PRICING_BASIS.AGREED;
    const retailMarkup = resolveRetailMarkup(payload.retailMarkup, pricingBasis);
    const retFromSupplier =
      payload.retFromSupplier !== null && payload.retFromSupplier !== undefined
        ? Number(payload.retFromSupplier)
        : null;

    item.pricingBasis = pricingBasis;
    item.mnfMarkup = payload.mnfMarkup ?? item.mnfMarkup ?? DEFAULT_MARKUP;
    item.frcMarkup = payload.frcMarkup ?? item.frcMarkup ?? DEFAULT_MARKUP;
    item.retailMarkup = retailMarkup;
    item.retFromSupplier = retFromSupplier;

    if (payload.regionalCosts) {
      item.regionalCosts = {
        cpt: payload.regionalCosts.cpt ?? item.regionalCosts?.cpt ?? null,
        jhb: payload.regionalCosts.jhb ?? item.regionalCosts?.jhb ?? null,
        agreed: item.regionalCosts?.agreed ?? null,
      };
    }

    if (payload.supplierName) item.supplierName = payload.supplierName;
    if (payload.supplierCode) item.supplierCode = payload.supplierCode;

    const pricing = calculateHardwarePricing(item);
    item.regionalCosts.agreed = pricing.agreed;

    // eslint-disable-next-line no-await-in-loop
    await item.save();
    // eslint-disable-next-line no-await-in-loop
    await hardwareItemRangeService.upsertFromHardware({
      ...item.toObject(),
      id: item._id,
      pricingDetails: pricing,
    });

    updated += 1;
    if (pricingBasis === PRICING_BASIS.RETAIL) retail += 1;
    else agreed += 1;

    if (updated % 400 === 0) {
      console.log(`  Updated ${updated}…`);
    }
  }

  console.log('\nRetail-basis repair complete.');
  console.log(`  Updated: ${updated}`);
  console.log(`  Pricing Basis Retail: ${retail}`);
  console.log(`  Pricing Basis Agreed: ${agreed}`);
  console.log(`  Excel rows with no DB match: ${missing}`);

  const sample = await HardwareItem.findOne({ stockCode: 'SIN2095-NS' }).lean();
  if (sample) {
    const p = calculateHardwarePricing(sample);
    console.log('\nSIN2095-NS check:', {
      pricingBasis: sample.pricingBasis,
      retFromSupplier: sample.retFromSupplier,
      retailMarkup: sample.retailMarkup,
      frcPrice: p.frcPrice,
      retailExVat: p.retailPriceExVat,
      retailInclVat: p.retailPriceInclVat,
      margins: p.margins,
    });
  }

  await mongoose.disconnect();
};

main().catch(async (error) => {
  console.error(error);
  try {
    await mongoose.disconnect();
  } catch {
    // ignore
  }
  process.exit(1);
});
