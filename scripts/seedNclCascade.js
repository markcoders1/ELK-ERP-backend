/**
 * Seed HW/FC component lines + catalogue identity from National Components List.
 *
 * Reads the NCL MASTER workbook, wipes only hw/fc line collections, inserts
 * lines with Excel-faithful costs / formulas, upserts Component catalogue rows,
 * then cascades catalogueMetrics.hwCost / hwRetail for products with HW lines.
 *
 * Boards skipped: Board model has no pricePerM2 field.
 *
 * Usage (from server/):
 *   npm run seed:ncl-cascade
 *
 * Optional:
 *   NCL_XLSX_PATH=/path/to/file.xlsx
 *
 * Prerequisites: Hardware Master (+ ideally HIR) already seeded so COST PRICE resolves.
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const XLSX = require('xlsx');
const connectDatabase = require('../config/database');
const HardwareItem = require('../features/hardware/hardwareItem.model');
const HardwareItemRange = require('../features/hardware-item-range/hardwareItemRange.model');
const HwComponentLine = require('../features/hw-components/hwComponentLine.model');
const FcComponentLine = require('../features/fc-components/fcComponentLine.model');
const Component = require('../features/components/component.model');
const {
  calculateHardwarePricing,
} = require('../features/hardware/hardwarePricing.service');
const {
  calculateBoardM2,
  calculateEdgingLinearMeter,
} = require('../features/fc-components/fcFormulas');
const {
  updateCatalogueHwMetrics,
} = require('../features/cascade/cascade.service');
const { COMPONENT_VERSION_STATUS } = require('../config/constants');

const DEFAULT_NCL_PATH =
  '/home/syed-ahad/Downloads/National Components List_MASTER 2026 (2).xlsx';

const SHEET_HW = 'HW Components List';
const SHEET_FC = 'FC Components List';
const SHEET_CATALOGUE = 'Carcasses & BIC Catalogue';

const INSERT_CHUNK = 500;
const CASCADE_LOG_EVERY = 100;

const toNumber = (value, fallback = null) => {
  if (value === '' || value === null || value === undefined) return fallback;
  if (typeof value === 'boolean') return fallback;
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
};

const roundMoney = (value) => {
  if (value === null || value === undefined || Number.isNaN(value)) return null;
  return Math.round(value * 10000) / 10000;
};

const normalizeCode = (value) => String(value || '').trim().toUpperCase();

const normalizeHeader = (value) =>
  String(value || '')
    .replace(/\s+/g, ' ')
    .trim();

const cellStr = (value) => {
  if (value === null || value === undefined) return '';
  if (typeof value === 'boolean') return value ? 'Yes' : '';
  return String(value).trim();
};

/**
 * Convert a worksheet to objects using a chosen header row (0-based).
 * Avoids relying on messy Excel header keys with embedded newlines.
 */
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

  const get = (cells, name) => {
    const idx = headerIndex.get(name);
    if (idx === undefined) return '';
    return cells[idx];
  };

  const rows = [];
  for (let i = headerRowIndex + 1; i < matrix.length; i += 1) {
    const cells = matrix[i];
    if (!cells || !Array.isArray(cells)) continue;
    const hasValue = cells.some((c) => c !== '' && c !== null && c !== undefined);
    if (!hasValue) continue;
    rows.push({ get: (name) => get(cells, name), cells });
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
  // Partial / starts-with fallback (e.g. "HW Mark Up" vs "HW Mark Up …")
  // eslint-disable-next-line no-restricted-syntax
  for (const candidate of candidates) {
    const needle = candidate.toUpperCase();
    const found = headers.find((h) => h.toUpperCase().startsWith(needle));
    if (found) return found;
  }
  return null;
};

const chunkArray = (items, size) => {
  const chunks = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
};

const insertInChunks = async (Model, docs, label) => {
  let inserted = 0;
  const chunks = chunkArray(docs, INSERT_CHUNK);
  // eslint-disable-next-line no-restricted-syntax
  for (const chunk of chunks) {
    // eslint-disable-next-line no-await-in-loop
    const result = await Model.insertMany(chunk, { ordered: false });
    inserted += result.length;
    console.log(`  ${label}: ${inserted}/${docs.length}`);
  }
  return inserted;
};

const buildCostMaps = async () => {
  const hirByCode = new Map();
  const hirDocs = await HardwareItemRange.find({}).select('itemCode manufacturingPrice').lean();
  hirDocs.forEach((doc) => {
    const code = normalizeCode(doc.itemCode);
    if (code) hirByCode.set(code, doc.manufacturingPrice);
  });

  const hwMnfByCode = new Map();
  const hwDocs = await HardwareItem.find({ deletedAt: null }).lean();
  hwDocs.forEach((doc) => {
    const code = normalizeCode(doc.stockCode);
    if (!code) return;
    const pricing = calculateHardwarePricing(doc);
    if (pricing.mnfPrice != null) {
      hwMnfByCode.set(code, pricing.mnfPrice);
    }
  });

  return { hirByCode, hwMnfByCode };
};

const resolveCostPrice = (hardwareItem, { hirByCode, hwMnfByCode }) => {
  const code = normalizeCode(hardwareItem);
  if (!code) return null;
  if (hirByCode.has(code) && hirByCode.get(code) != null) {
    return Number(hirByCode.get(code));
  }
  if (hwMnfByCode.has(code) && hwMnfByCode.get(code) != null) {
    return Number(hwMnfByCode.get(code));
  }
  return null;
};

const loadWorkbook = (filePath) => {
  if (!fs.existsSync(filePath)) {
    throw new Error(`NCL workbook not found: ${filePath}`);
  }

  console.log(`Reading workbook (selected sheets only): ${filePath}`);
  return XLSX.readFile(filePath, {
    sheets: [SHEET_HW, SHEET_FC, SHEET_CATALOGUE],
    cellDates: false,
  });
};

const buildHwDocs = (ws, costMaps) => {
  const { rows, headers } = sheetToObjects(ws, 0);
  const col = {
    range: findHeader(headers, ['RANGE']),
    category: findHeader(headers, ['CATEGORY']),
    productCode: findHeader(headers, ['PRODUCT CODE']),
    hardwareItem: findHeader(headers, ['HARDWARE ITEM']),
    qty: findHeader(headers, ['QTY']),
    itemCount: findHeader(headers, ['ITEM COUNT']),
    checkInFc: findHeader(headers, [
      '↓CHECK↓ PRODUCT CODE IN FC COMPONENTS',
      'CHECK PRODUCT CODE IN FC COMPONENTS',
    ]),
    checkInCatalogue: findHeader(headers, [
      '↓CHECK↓ PRODUCT CODE IN CATALOGUE',
      'CHECK PRODUCT CODE IN CATALOGUE',
    ]),
    matchInBoth: findHeader(headers, ['MATCH IN BOTH']),
  };

  if (!col.productCode || !col.hardwareItem) {
    throw new Error(`${SHEET_HW}: missing PRODUCT CODE / HARDWARE ITEM columns`);
  }

  const docs = [];
  let skipped = 0;
  let missingCost = 0;
  const productCodes = new Set();

  rows.forEach((row) => {
    const productCode = normalizeCode(row.get(col.productCode));
    const hardwareItem = normalizeCode(row.get(col.hardwareItem));
    if (!productCode || !hardwareItem) {
      skipped += 1;
      return;
    }

    const quantity = toNumber(row.get(col.qty), 0) ?? 0;
    const costPriceRaw = resolveCostPrice(hardwareItem, costMaps);
    if (costPriceRaw == null) missingCost += 1;
    const costPrice = costPriceRaw != null ? roundMoney(costPriceRaw) : null;
    const totalCost =
      costPrice != null ? roundMoney(quantity * costPrice) : null;

    productCodes.add(productCode);

    docs.push({
      range: cellStr(row.get(col.range)),
      category: cellStr(row.get(col.category)),
      productCode,
      hardwareItem,
      quantity,
      itemCount: toNumber(row.get(col.itemCount), null),
      costPrice,
      totalCost,
      checkInFc: cellStr(col.checkInFc ? row.get(col.checkInFc) : ''),
      checkInCatalogue: cellStr(
        col.checkInCatalogue ? row.get(col.checkInCatalogue) : ''
      ),
      matchInBoth: cellStr(col.matchInBoth ? row.get(col.matchInBoth) : ''),
      deletedAt: null,
    });
  });

  return { docs, skipped, missingCost, productCodes };
};

const buildFcDocs = (ws) => {
  const { rows, headers } = sheetToObjects(ws, 0);
  const col = {
    range: findHeader(headers, ['RANGE']),
    category: findHeader(headers, ['CATEGORY']),
    productCode: findHeader(headers, ['PRODUCT CODE']),
    component: findHeader(headers, ['COMPONENT']),
    qty: findHeader(headers, ['QTY']),
    length: findHeader(headers, ['LENGTH']),
    width: findHeader(headers, ['WIDTH']),
    edging: findHeader(headers, ['EDGING']),
    childPartCode: findHeader(headers, ['CHILD PART CODE']),
    childPartDescription: findHeader(headers, ['CHILD PART DESCRIPTION']),
    type: findHeader(headers, ['TYPE']),
    note: findHeader(headers, ['NOTE']),
    checkInHw: findHeader(headers, [
      '↓CHECK↓ PRODUCT CODE IN HW COMPONENTS',
      'CHECK PRODUCT CODE IN HW COMPONENTS',
    ]),
    checkInCatalogue: findHeader(headers, [
      '↓CHECK↓ PRODUCT CODE IN CATALOGUE',
      'CHECK PRODUCT CODE IN CATALOGUE',
    ]),
    match: findHeader(headers, ['MATCH']),
  };

  if (!col.productCode || !col.component) {
    throw new Error(`${SHEET_FC}: missing PRODUCT CODE / COMPONENT columns`);
  }

  const docs = [];
  let skipped = 0;

  rows.forEach((row) => {
    const productCode = normalizeCode(row.get(col.productCode));
    const component = cellStr(row.get(col.component));
    if (!productCode || !component) {
      skipped += 1;
      return;
    }

    const quantity = toNumber(row.get(col.qty), 0) ?? 0;
    const length = toNumber(row.get(col.length), 0) ?? 0;
    const width = toNumber(row.get(col.width), 0) ?? 0;
    const edging = cellStr(row.get(col.edging));

    docs.push({
      range: cellStr(row.get(col.range)),
      category: cellStr(row.get(col.category)),
      productCode,
      component,
      quantity,
      length,
      width,
      boardM2: calculateBoardM2({ length, width, quantity }),
      edging,
      edgingLinearMeter: calculateEdgingLinearMeter({
        edging,
        length,
        width,
        quantity,
      }),
      childPartCode: cellStr(row.get(col.childPartCode)),
      childPartDescription: cellStr(row.get(col.childPartDescription)),
      type: cellStr(row.get(col.type)),
      note: cellStr(row.get(col.note)),
      checkInHw: cellStr(col.checkInHw ? row.get(col.checkInHw) : ''),
      checkInCatalogue: cellStr(
        col.checkInCatalogue ? row.get(col.checkInCatalogue) : ''
      ),
      match: cellStr(col.match ? row.get(col.match) : ''),
      deletedAt: null,
    });
  });

  return { docs, skipped };
};

const upsertCatalogue = async (ws) => {
  // Workbook header is Excel row 5 → 0-based index 4
  const { rows, headers } = sheetToObjects(ws, 4);
  const col = {
    range: findHeader(headers, ['Range']),
    type: findHeader(headers, ['Type']),
    modificationClass: findHeader(headers, ['Modification Class']),
    category: findHeader(headers, ['Category']),
    region: findHeader(headers, ['Region']),
    categoryDescription: findHeader(headers, ['Category Description']),
    code: findHeader(headers, ['Code']),
    colourCode: findHeader(headers, ['Colour Code']),
    description: findHeader(headers, ['Description']),
    hwIncluded: findHeader(headers, [
      '↓Check ↓ Included in HW Components',
      'Check Included in HW Components',
    ]),
    fcIncluded: findHeader(headers, [
      '↓Check ↓ Included in FC Components',
      'Check Included in FC Components',
    ]),
    matchStatus: findHeader(headers, ['Match']),
    hwCost: findHeader(headers, ['HW Cost']),
    hwMarkup: findHeader(headers, ['HW Mark Up']),
    hwRetail: findHeader(headers, ['HW Retail Price']),
    fcMasoniteUsage: findHeader(headers, ['FC Masonite Usage m²']),
    fcMasoniteCostPerM2: findHeader(headers, ['FC Masonite Cost per m²']),
    fcBoardUsage: findHeader(headers, ['FC Board Usage m²']),
    fcWhiteMelamineCostPerM2: findHeader(headers, [
      'FC White Melamine Cost per m²',
    ]),
    edgingUsage: findHeader(headers, ['Edging m²']),
    edgingCostPerM2: findHeader(headers, ['Edging Cost per m²']),
    fcMarkup: findHeader(headers, ['FC Mark Up']),
    wastage: findHeader(headers, ['Wastage']),
  };

  if (!col.code || !col.description) {
    throw new Error(
      `${SHEET_CATALOGUE}: missing Code / Description columns (header row 5)`
    );
  }

  let created = 0;
  let updated = 0;
  let skipped = 0;
  const codes = [];

  // eslint-disable-next-line no-restricted-syntax
  for (const row of rows) {
    const componentCode = normalizeCode(row.get(col.code));
    const description = cellStr(row.get(col.description));
    if (!componentCode || !description) {
      skipped += 1;
      // eslint-disable-next-line no-continue
      continue;
    }

    const catalogueMetrics = {
      hwCost: toNumber(col.hwCost ? row.get(col.hwCost) : null, null),
      hwMarkup: toNumber(col.hwMarkup ? row.get(col.hwMarkup) : null, null),
      hwRetail: toNumber(col.hwRetail ? row.get(col.hwRetail) : null, null),
      fcMasoniteUsage: toNumber(
        col.fcMasoniteUsage ? row.get(col.fcMasoniteUsage) : null,
        null
      ),
      fcMasoniteCostPerM2: toNumber(
        col.fcMasoniteCostPerM2 ? row.get(col.fcMasoniteCostPerM2) : null,
        null
      ),
      fcBoardUsage: toNumber(
        col.fcBoardUsage ? row.get(col.fcBoardUsage) : null,
        null
      ),
      fcWhiteMelamineCostPerM2: toNumber(
        col.fcWhiteMelamineCostPerM2
          ? row.get(col.fcWhiteMelamineCostPerM2)
          : null,
        null
      ),
      edgingUsage: toNumber(
        col.edgingUsage ? row.get(col.edgingUsage) : null,
        null
      ),
      edgingCostPerM2: toNumber(
        col.edgingCostPerM2 ? row.get(col.edgingCostPerM2) : null,
        null
      ),
      fcMarkup: toNumber(col.fcMarkup ? row.get(col.fcMarkup) : null, null),
      wastage: toNumber(col.wastage ? row.get(col.wastage) : null, null),
    };

    const identity = {
      componentCode,
      description,
      category: cellStr(row.get(col.category)),
      range: cellStr(row.get(col.range)),
      type: cellStr(row.get(col.type)),
      modificationClass: cellStr(row.get(col.modificationClass)),
      region: cellStr(row.get(col.region)),
      categoryDescription: cellStr(row.get(col.categoryDescription)),
      colourCode: cellStr(row.get(col.colourCode)),
      hwIncluded: cellStr(col.hwIncluded ? row.get(col.hwIncluded) : ''),
      fcIncluded: cellStr(col.fcIncluded ? row.get(col.fcIncluded) : ''),
      matchStatus: cellStr(col.matchStatus ? row.get(col.matchStatus) : ''),
      catalogueMetrics,
      isActive: true,
      deletedAt: null,
      versionStatus: COMPONENT_VERSION_STATUS.APPROVED,
      status: 'Active',
    };

    // eslint-disable-next-line no-await-in-loop
    const existing = await Component.findOne({
      componentCode,
      versionStatus: COMPONENT_VERSION_STATUS.APPROVED,
      deletedAt: null,
    });

    if (existing) {
      Object.assign(existing, identity);
      // eslint-disable-next-line no-await-in-loop
      await existing.save();
      updated += 1;
    } else {
      // eslint-disable-next-line no-await-in-loop
      await Component.create({
        ...identity,
        lineageId: new mongoose.Types.ObjectId(),
        version: 1,
      });
      created += 1;
    }

    codes.push(componentCode);
  }

  return { created, updated, skipped, codes };
};

const seedNclCascade = async () => {
  const filePath = process.env.NCL_XLSX_PATH || DEFAULT_NCL_PATH;

  await connectDatabase();

  console.log('Building cost maps from Hardware Item Range + Hardware Master…');
  const costMaps = await buildCostMaps();
  console.log(
    `  HIR items: ${costMaps.hirByCode.size}, Hardware MNF: ${costMaps.hwMnfByCode.size}`
  );

  const workbook = loadWorkbook(filePath);
  const hwSheet = workbook.Sheets[SHEET_HW];
  const fcSheet = workbook.Sheets[SHEET_FC];
  const catalogueSheet = workbook.Sheets[SHEET_CATALOGUE];

  if (!hwSheet || !fcSheet || !catalogueSheet) {
    throw new Error(
      `Missing required sheets. Need: ${SHEET_HW}, ${SHEET_FC}, ${SHEET_CATALOGUE}`
    );
  }

  console.log('Parsing HW Components List…');
  const hw = buildHwDocs(hwSheet, costMaps);
  console.log(
    `  Rows ready: ${hw.docs.length} (skipped ${hw.skipped}, missing cost ${hw.missingCost})`
  );

  console.log('Parsing FC Components List…');
  const fc = buildFcDocs(fcSheet);
  console.log(`  Rows ready: ${fc.docs.length} (skipped ${fc.skipped})`);

  console.log('Wiping hw_component_lines / fc_component_lines only…');
  const [hwWipe, fcWipe] = await Promise.all([
    HwComponentLine.deleteMany({}),
    FcComponentLine.deleteMany({}),
  ]);
  console.log(
    `  Deleted HW lines: ${hwWipe.deletedCount || 0}, FC lines: ${fcWipe.deletedCount || 0}`
  );
  console.log('  (Hardware Master / HIR untouched)');
  console.log('  (Board Range skipped — Board model has no pricePerM2)');

  console.log('Inserting HW Components List…');
  const hwInserted = await insertInChunks(HwComponentLine, hw.docs, 'HW');

  console.log('Inserting FC Components List…');
  const fcInserted = await insertInChunks(FcComponentLine, fc.docs, 'FC');

  console.log('Upserting Carcasses & BIC Catalogue → Component (APPROVED)…');
  const catalogue = await upsertCatalogue(catalogueSheet);
  console.log(
    `  Created: ${catalogue.created}, Updated: ${catalogue.updated}, Skipped: ${catalogue.skipped}`
  );

  console.log(
    'Cascading catalogueMetrics.hwCost / hwRetail for products with HW lines…'
  );
  const productCodes = [...hw.productCodes];
  let cascadeUpdated = 0;
  let cascadeMissing = 0;
  for (let i = 0; i < productCodes.length; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    const result = await updateCatalogueHwMetrics(productCodes[i]);
    if (result.updated) cascadeUpdated += 1;
    else cascadeMissing += 1;
    if ((i + 1) % CASCADE_LOG_EVERY === 0 || i === productCodes.length - 1) {
      console.log(`  Cascade progress: ${i + 1}/${productCodes.length}`);
    }
  }

  console.log('\nNCL cascade seed complete.');
  console.log(`  HW lines inserted: ${hwInserted}`);
  console.log(`  FC lines inserted: ${fcInserted}`);
  console.log(
    `  Components upserted: ${catalogue.created + catalogue.updated} (new ${catalogue.created})`
  );
  console.log(
    `  Catalogue HW metrics cascaded: ${cascadeUpdated} (no live component: ${cascadeMissing})`
  );

  process.exit(0);
};

seedNclCascade().catch((error) => {
  console.error('NCL cascade seed failed:', error.message);
  console.error(error.stack);
  process.exit(1);
});
