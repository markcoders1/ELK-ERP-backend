/**
 * Seed Finish Pricing (VARIANT) section items from Carcasses & BIC Catalogue
 * finish columns (Super White, Sonae…, PG…, ELKP…, etc.).
 *
 * Safe to re-run: replaces VARIANT items per product; leaves HW/FC cascade lines alone.
 *
 * Usage (from server/):
 *   node scripts/seedCatalogueFinishes.js
 */

require('dotenv').config();
const fs = require('fs');
const mongoose = require('mongoose');
const XLSX = require('xlsx');
const connectDatabase = require('../config/database');
const Component = require('../features/components/component.model');
const ComponentSection = require('../features/component-sections/componentSection.model');
const SectionItem = require('../features/section-items/sectionItem.model');
const { COMPONENT_VERSION_STATUS } = require('../config/constants');

const DEFAULT_NCL_PATH =
  process.env.NCL_XLSX_PATH ||
  '/home/syed-ahad/Downloads/National Components List_MASTER 2026 (2).xlsx';

const SHEET = 'Carcasses & BIC Catalogue';

const IDENTITY_OR_COSTING = new Set(
  [
    'Range',
    'Type',
    'Modification Class',
    'Category',
    'Region',
    'Category Description',
    'Code',
    'Colour Code',
    'Description',
    'Incl. Cor',
    'Match',
    'HW Cost',
    'HW Mark Up',
    'HW Retail Price',
    'FC Masonite Usage m²',
    'FC Masonite Cost per m²',
    'FC Board Usage m²',
    'FC White Melamine Cost per m²',
    'Edging m²',
    'Edging Cost per m²',
    'FC Mark Up',
    'Wastage',
  ].map((h) => h.toUpperCase())
);

const normalizeHeader = (value) =>
  String(value || '')
    .replace(/\s+/g, ' ')
    .trim();

const normalizeCode = (value) => String(value || '').trim().toUpperCase();

const toNumber = (value) => {
  if (value === '' || value === null || value === undefined) return null;
  if (typeof value === 'boolean') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

const isCheckHeader = (name) => {
  const u = name.toUpperCase();
  return u.includes('CHECK') || u.includes('↓CHECK');
};

const sheetToMatrix = (ws) =>
  XLSX.utils.sheet_to_json(ws, {
    header: 1,
    defval: '',
    blankrows: false,
    raw: true,
  });

const seedFinishes = async () => {
  const filePath = DEFAULT_NCL_PATH;
  if (!fs.existsSync(filePath)) {
    throw new Error(`NCL workbook not found: ${filePath}`);
  }

  await connectDatabase();

  console.log(`Reading ${SHEET}…`);
  const workbook = XLSX.readFile(filePath, {
    sheets: [SHEET],
    cellDates: false,
  });
  const ws = workbook.Sheets[SHEET];
  if (!ws) throw new Error(`Missing sheet: ${SHEET}`);

  const matrix = sheetToMatrix(ws);
  // Excel header row 5 → index 4 (same as seedNclCascade)
  const headerRowIndex = 4;
  const headers = (matrix[headerRowIndex] || []).map(normalizeHeader);
  const codeIdx = headers.findIndex((h) => h.toUpperCase() === 'CODE');
  if (codeIdx < 0) throw new Error('Code column not found on catalogue sheet');

  const finishCols = [];
  headers.forEach((name, idx) => {
    if (!name) return;
    const upper = name.toUpperCase();
    if (IDENTITY_OR_COSTING.has(upper) || isCheckHeader(name)) return;
    // Skip empty / pure number labels from helper row
    if (/^COLUMN_/.test(name)) return;
    finishCols.push({ idx, name });
  });

  console.log(`  Finish columns detected: ${finishCols.length}`);
  if (finishCols.length) {
    console.log(
      `  Sample: ${finishCols
        .slice(0, 8)
        .map((c) => c.name)
        .join(' | ')}`
    );
  }

  let products = 0;
  let finishRows = 0;

  for (let r = headerRowIndex + 1; r < matrix.length; r += 1) {
    const cells = matrix[r] || [];
    const componentCode = normalizeCode(cells[codeIdx]);
    if (!componentCode) continue;

    const finishes = [];
    finishCols.forEach((col, sortOrder) => {
      const retailPrice = toNumber(cells[col.idx]);
      if (retailPrice == null) return;
      finishes.push({
        quantity: 1,
        sortOrder,
        attributes: {
          finishName: col.name,
          priceGroup: col.name,
          retailPrice,
          status: 'Active',
        },
      });
    });

    if (!finishes.length) continue;

    // eslint-disable-next-line no-await-in-loop
    const component = await Component.findOne({
      componentCode,
      deletedAt: null,
      versionStatus: COMPONENT_VERSION_STATUS.APPROVED,
    });
    if (!component) continue;

    // eslint-disable-next-line no-await-in-loop
    let section = await ComponentSection.findOne({
      componentId: component._id,
      sectionType: 'VARIANT',
    });

    if (!section) {
      // eslint-disable-next-line no-await-in-loop
      section = await ComponentSection.create({
        componentId: component._id,
        sectionType: 'VARIANT',
        name: 'Finish Pricing',
        sortOrder: 30,
      });
    }

    // eslint-disable-next-line no-await-in-loop
    await SectionItem.deleteMany({
      componentId: component._id,
      sectionId: section._id,
    });

    const docs = finishes.map((item, index) => ({
      componentId: component._id,
      sectionId: section._id,
      sectionType: 'VARIANT',
      quantity: 1,
      notes: '',
      unitCost: null,
      hardwareId: null,
      attributes: item.attributes,
      sortOrder: item.sortOrder ?? index,
    }));

    // eslint-disable-next-line no-await-in-loop
    await SectionItem.insertMany(docs, { ordered: false });
    products += 1;
    finishRows += docs.length;

    if (products % 200 === 0) {
      console.log(`  Products with finishes: ${products}`);
    }
  }

  console.log('\nFinish seed complete.');
  console.log(`  Products: ${products}`);
  console.log(`  Finish price rows: ${finishRows}`);

  await mongoose.disconnect();
};

seedFinishes().catch(async (error) => {
  console.error(error);
  try {
    await mongoose.disconnect();
  } catch {
    // ignore
  }
  process.exit(1);
});
