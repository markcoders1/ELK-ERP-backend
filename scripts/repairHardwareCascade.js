/**
 * Repair Excel cascade:
 * 1) Optional: seed HIR Manufacturing Price from NCL Hardware Item Range
 * 2) Upsert HIR from Hardware Master (overrides with live MNF when present)
 * 3) Recalc all HW line costs
 * 4) Refresh catalogue hwCost / hwRetail / finish
 *
 * Usage (from server/):
 *   npm run cascade:repair
 *   NCL_XLSX_PATH=/path/to/ncl.xlsx npm run cascade:repair
 */

require('dotenv').config();
const fs = require('fs');
const mongoose = require('mongoose');
const XLSX = require('xlsx');
const connectDatabase = require('../config/database');
const HardwareItem = require('../features/hardware/hardwareItem.model');
const HwComponentLine = require('../features/hw-components/hwComponentLine.model');
const {
  calculateHardwarePricing,
} = require('../features/hardware/hardwarePricing.service');
const hardwareItemRangeService = require('../features/hardware-item-range/hardwareItemRange.service');
const hwComponentsService = require('../features/hw-components/hwComponents.service');
const {
  updateCatalogueHwMetrics,
} = require('../features/cascade/cascade.service');

const DEFAULT_NCL_PATH =
  process.env.NCL_XLSX_PATH ||
  '/home/syed-ahad/Downloads/National Components List_MASTER 2026 (2).xlsx';

const SHEET_HIR = 'Hardware Item Range';

const toNumber = (value, fallback = null) => {
  if (value === '' || value === null || value === undefined) return fallback;
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
};

const normalizeHeader = (value) =>
  String(value || '')
    .replace(/\s+/g, ' ')
    .trim();

const sheetToObjects = (ws, headerRowIndex = 0) => {
  const matrix = XLSX.utils.sheet_to_json(ws, {
    header: 1,
    defval: '',
    blankrows: false,
    raw: true,
  });
  if (!matrix.length || headerRowIndex >= matrix.length) {
    return { rows: [], headers: [] };
  }
  const headers = matrix[headerRowIndex].map(normalizeHeader);
  const headerIndex = new Map();
  headers.forEach((name, idx) => {
    if (name && !headerIndex.has(name)) headerIndex.set(name, idx);
  });
  const rows = [];
  for (let i = headerRowIndex + 1; i < matrix.length; i += 1) {
    const cells = matrix[i];
    if (!cells || !Array.isArray(cells)) continue;
    if (!cells.some((c) => c !== '' && c !== null && c !== undefined)) continue;
    rows.push({
      get: (name) => {
        const idx = headerIndex.get(name);
        return idx === undefined ? '' : cells[idx];
      },
    });
  }
  return { rows, headers: [...headerIndex.keys()] };
};

const findHeader = (headers, candidates) => {
  const upperMap = new Map(headers.map((h) => [h.toUpperCase(), h]));
  // eslint-disable-next-line no-restricted-syntax
  for (const candidate of candidates) {
    const hit = upperMap.get(candidate.toUpperCase());
    if (hit) return hit;
  }
  return null;
};

const seedHirFromNcl = async (filePath) => {
  if (!fs.existsSync(filePath)) {
    console.log(`  NCL workbook not found (${filePath}) — skip HIR from NCL`);
    return 0;
  }
  const workbook = XLSX.readFile(filePath, {
    sheets: [SHEET_HIR],
    cellDates: false,
  });
  const ws = workbook.Sheets[SHEET_HIR];
  if (!ws) {
    console.log(`  Sheet "${SHEET_HIR}" missing — skip`);
    return 0;
  }

  const { rows, headers } = sheetToObjects(ws, 0);
  const col = {
    groupCode: findHeader(headers, ['Group Code', 'GROUP CODE']),
    itemCode: findHeader(headers, ['Item Code', 'ITEM CODE']),
    description: findHeader(headers, ['Description', 'DESCRIPTION']),
    manufacturingPrice: findHeader(headers, [
      'Manufacturing Price',
      'MANUFACTURING PRICE',
    ]),
  };
  if (!col.itemCode || !col.manufacturingPrice) {
    throw new Error(`${SHEET_HIR}: missing Item Code / Manufacturing Price`);
  }

  let upserted = 0;
  // eslint-disable-next-line no-restricted-syntax
  for (const row of rows) {
    const itemCode = String(row.get(col.itemCode) || '')
      .trim()
      .toUpperCase();
    if (!itemCode) continue;
    // eslint-disable-next-line no-await-in-loop
    await hardwareItemRangeService.upsertManufacturingPrice({
      itemCode,
      groupCode: String(col.groupCode ? row.get(col.groupCode) : '').trim(),
      description: String(col.description ? row.get(col.description) : '').trim(),
      manufacturingPrice: toNumber(row.get(col.manufacturingPrice), null),
    });
    upserted += 1;
    if (upserted % 500 === 0) console.log(`  HIR from NCL: ${upserted}`);
  }
  return upserted;
};

const repair = async () => {
  await connectDatabase();

  console.log('Seeding HIR from NCL Hardware Item Range…');
  const fromNcl = await seedHirFromNcl(DEFAULT_NCL_PATH);
  console.log(`  HIR from NCL: ${fromNcl}`);

  const hardwareItems = await HardwareItem.find({ deletedAt: null }).lean();
  console.log(
    `Upserting HIR from ${hardwareItems.length} Hardware Master rows (live MNF wins)…`
  );

  let hir = 0;
  // eslint-disable-next-line no-restricted-syntax
  for (const item of hardwareItems) {
    const pricing = calculateHardwarePricing(item);
    // eslint-disable-next-line no-await-in-loop
    await hardwareItemRangeService.upsertFromHardware({
      ...item,
      id: item._id,
      pricingDetails: pricing,
    });
    hir += 1;
    if (hir % 250 === 0) console.log(`  HIR ${hir}/${hardwareItems.length}`);
  }
  console.log(`  HIR from Master: ${hir}`);

  const distinctHw = await HwComponentLine.distinct('hardwareItem', {
    deletedAt: null,
  });
  console.log(`Recalculating HW Components costs for ${distinctHw.length} item codes…`);

  let lines = 0;
  // eslint-disable-next-line no-restricted-syntax
  for (const code of distinctHw) {
    // eslint-disable-next-line no-await-in-loop
    const result = await hwComponentsService.recalculateCostsForHardwareItem(code);
    lines += result.linesUpdated;
  }
  console.log(`  HW lines updated: ${lines}`);

  const productCodes = await HwComponentLine.distinct('productCode', {
    deletedAt: null,
  });
  console.log(`Updating catalogue metrics for ${productCodes.length} products…`);

  let catalogues = 0;
  // eslint-disable-next-line no-restricted-syntax
  for (let i = 0; i < productCodes.length; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    const touch = await updateCatalogueHwMetrics(productCodes[i]);
    if (touch.updated) catalogues += 1;
    if ((i + 1) % 200 === 0) {
      console.log(`  Catalogue ${i + 1}/${productCodes.length}`);
    }
  }

  console.log('\nCascade repair complete.');
  console.log(`  HIR from NCL: ${fromNcl}`);
  console.log(`  HIR from Master: ${hir}`);
  console.log(`  HW lines: ${lines}`);
  console.log(`  Catalogue products updated: ${catalogues}`);

  await mongoose.disconnect();
};

repair().catch(async (error) => {
  console.error(error);
  try {
    await mongoose.disconnect();
  } catch {
    // ignore
  }
  process.exit(1);
});
