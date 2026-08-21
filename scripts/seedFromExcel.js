/**
 * Wipe dummy/test pricing data and reload from the two Excel workbooks.
 *
 * Does NOT touch users. Does NOT change app runtime behaviour — data only.
 *
 * Workbooks (defaults; override with env):
 *   HW_XLSX_PATH  → Hardware Master File (uses sheet "Master File")
 *   NCL_XLSX_PATH → National Components List MASTER
 *
 * Usage (from server/):
 *   node scripts/seedFromExcel.js
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const connectDatabase = require('../config/database');
const { parseWorkbook } = require('../features/hardware-import/excel.parser');
const { normalizeHardwareRow } = require('../features/hardware-import/normalizer');
const HardwareItem = require('../features/hardware/hardwareItem.model');
const HardwareItemRange = require('../features/hardware-item-range/hardwareItemRange.model');
const HwComponentLine = require('../features/hw-components/hwComponentLine.model');
const FcComponentLine = require('../features/fc-components/fcComponentLine.model');
const Component = require('../features/components/component.model');
const ComponentSection = require('../features/component-sections/componentSection.model');
const SectionItem = require('../features/section-items/sectionItem.model');
const ChangeRequest = require('../features/hardware-approvals/changeRequest.model');
const AuditLog = require('../features/hardware-approvals/auditLog.model');
const Notification = require('../features/hardware-approvals/notification.model');
const ImportBatch = require('../features/hardware-import/importBatch.model');
const ImportPreviewRow = require('../features/hardware-import/importPreviewRow.model');
const { PRICING_BASIS } = require('../config/constants');
const { DEFAULT_MARKUP } = require('../features/hardware/hardwarePricing.service');

const DEFAULT_HW_PATH =
  '/home/syed-ahad/Downloads/Hardware Master File_National_01102023 (2).xlsx';
const DEFAULT_NCL_PATH =
  '/home/syed-ahad/Downloads/National Components List_MASTER 2026 (2).xlsx';

const MASTER_SHEET = 'Master File';
const CHUNK = 500;

const wipeCollection = async (Model, label) => {
  const result = await Model.deleteMany({});
  console.log(`  ${label}: deleted ${result.deletedCount || 0}`);
  return result.deletedCount || 0;
};

const wipeAllPricingData = async () => {
  console.log('\n=== Wipe dummy / stale pricing data (users kept) ===');
  await wipeCollection(ImportPreviewRow, 'importpreviewrows');
  await wipeCollection(ImportBatch, 'importbatches');
  await wipeCollection(Notification, 'notifications');
  await wipeCollection(AuditLog, 'audits');
  await wipeCollection(ChangeRequest, 'hardwarechangerequests');
  await wipeCollection(SectionItem, 'section_items');
  await wipeCollection(ComponentSection, 'component_sections');
  await wipeCollection(Component, 'components');
  await wipeCollection(FcComponentLine, 'fccomponentlines');
  await wipeCollection(HwComponentLine, 'hwcomponentlines');
  await wipeCollection(HardwareItemRange, 'hardwareitemranges');
  await wipeCollection(HardwareItem, 'hardwareitems');
};

const importHardwareMasterFile = async (filePath) => {
  console.log('\n=== Import Hardware Master File (sheet: Master File) ===');
  if (!fs.existsSync(filePath)) {
    throw new Error(`Hardware workbook not found: ${filePath}`);
  }

  const buffer = fs.readFileSync(filePath);
  const { selectedSheet, sheetNames } = parseWorkbook(buffer, {
    sheetName: MASTER_SHEET,
  });

  console.log(`  Workbook sheets: ${sheetNames.join(', ')}`);
  console.log(`  Selected: ${selectedSheet.name} (${selectedSheet.rows.length} rows)`);

  const docs = [];
  let skipped = 0;
  const seen = new Set();

  selectedSheet.rows.forEach((row) => {
    const raw = row.raw || row;
    const { payload } = normalizeHardwareRow(raw, selectedSheet.headers);
    if (!payload.stockCode || !payload.groupCode || !payload.description) {
      skipped += 1;
      return;
    }
    if (seen.has(payload.stockCode)) {
      skipped += 1;
      return;
    }
    seen.add(payload.stockCode);

    docs.push({
      groupCode: payload.groupCode,
      stockCode: payload.stockCode,
      description: payload.description,
      supplierName: payload.supplierName || '',
      supplierCode: payload.supplierCode || '',
      regionalCosts: {
        cpt: payload.regionalCosts?.cpt ?? null,
        jhb: payload.regionalCosts?.jhb ?? null,
      },
      pricingBasis: payload.pricingBasis || PRICING_BASIS.AGREED,
      mnfMarkup: payload.mnfMarkup ?? DEFAULT_MARKUP,
      frcMarkup: payload.frcMarkup ?? DEFAULT_MARKUP,
      retailMarkup:
        payload.retailMarkup ??
        ((payload.pricingBasis || PRICING_BASIS.AGREED) === PRICING_BASIS.RETAIL
          ? null
          : DEFAULT_MARKUP),
      retFromSupplier: payload.retFromSupplier ?? null,
      weight: payload.weight ?? 0,
      isImport: Boolean(payload.isImport),
      isActive: payload.isActive !== false,
      deletedAt: null,
    });
  });

  console.log(`  Valid rows: ${docs.length} (skipped ${skipped})`);

  let inserted = 0;
  for (let i = 0; i < docs.length; i += CHUNK) {
    const chunk = docs.slice(i, i + CHUNK);
    // eslint-disable-next-line no-await-in-loop
    const result = await HardwareItem.insertMany(chunk, { ordered: false });
    inserted += result.length;
    console.log(`  Hardware inserted: ${inserted}/${docs.length}`);
  }

  console.log('  Syncing HIR manufacturingPrice from Master MNF…');
  const {
    calculateHardwarePricing,
  } = require('../features/hardware/hardwarePricing.service');
  const hardwareItemRangeService = require('../features/hardware-item-range/hardwareItemRange.service');
  const allHw = await HardwareItem.find({ deletedAt: null }).lean();
  let hirSynced = 0;
  // eslint-disable-next-line no-restricted-syntax
  for (const item of allHw) {
    const pricing = calculateHardwarePricing(item);
    // eslint-disable-next-line no-await-in-loop
    await hardwareItemRangeService.upsertFromHardware({
      ...item,
      id: item._id,
      pricingDetails: pricing,
    });
    hirSynced += 1;
    if (hirSynced % 500 === 0) {
      console.log(`  HIR from Master: ${hirSynced}/${allHw.length}`);
    }
  }
  console.log(`  HIR from Master: ${hirSynced}`);

  return inserted;
};

const runNclCascadeSeed = async (nclPath) => {
  console.log('\n=== Seed NCL cascade (HIR / HW / FC / Catalogue) ===');
  process.env.NCL_XLSX_PATH = nclPath;
  // Re-use existing Excel-faithful NCL seeder (exits process on its own if called as main).
  // Invoke its exported logic by requiring after setting env — seedNclCascade always exits.
  // Instead spawn as child so this orchestrator can continue.
  const { spawnSync } = require('child_process');
  const script = path.join(__dirname, 'seedNclCascade.js');
  const result = spawnSync(process.execPath, [script], {
    cwd: path.join(__dirname, '..'),
    env: { ...process.env, NCL_XLSX_PATH: nclPath },
    stdio: 'inherit',
  });
  if (result.status !== 0) {
    throw new Error(`seedNclCascade failed with exit code ${result.status}`);
  }
};

const main = async () => {
  const hwPath = process.env.HW_XLSX_PATH || DEFAULT_HW_PATH;
  const nclPath = process.env.NCL_XLSX_PATH || DEFAULT_NCL_PATH;

  console.log('Excel sources:');
  console.log(`  Hardware: ${hwPath}`);
  console.log(`  NCL:      ${nclPath}`);

  await connectDatabase();
  await wipeAllPricingData();
  const hwCount = await importHardwareMasterFile(hwPath);
  await mongoose.disconnect();

  await runNclCascadeSeed(nclPath);

  console.log('\n=== seedFromExcel complete ===');
  console.log(`  Hardware Master rows: ${hwCount}`);
  console.log('  NCL HIR + HW/FC lines + Carcasses & BIC Catalogue: see seedNclCascade log above');
  console.log('  Pending approvals / audits / import batches: emptied');
  console.log('  Users: unchanged');
  console.log('\nTip: seed finish columns with: node scripts/seedCatalogueFinishes.js');
};

main().catch(async (error) => {
  console.error('\nseedFromExcel failed:', error.message);
  console.error(error.stack);
  try {
    await mongoose.disconnect();
  } catch {
    // ignore
  }
  process.exit(1);
});
