/**
 * Load NCL Board List_arch + Edging Colour Range into Mongo.
 * Does not touch Hardware / HW-FC lines / catalogue.
 *
 *   npm run seed:ncl-boards
 *   NCL_XLSX_PATH=/path/to/ncl.xlsx
 */

require('dotenv').config();
const fs = require('fs');
const mongoose = require('mongoose');
const XLSX = require('xlsx');
const connectDatabase = require('../config/database');
const Board = require('../features/boards/board.model');
const EdgingColour = require('../features/edging/edgingColour.model');

const DEFAULT_NCL_PATH =
  process.env.NCL_XLSX_PATH ||
  '/home/syed-ahad/Downloads/National Components List_MASTER 2026 (2).xlsx';

const SHEET_BOARDS = 'Board List_arch';
const SHEET_RANGE = 'Board Range';
const SHEET_EDGING = 'Edging Colour Range';

const toNumber = (value) => {
  if (value === '' || value === null || value === undefined) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

const toText = (value) => (value == null ? '' : String(value).trim());

const getField = (row, needle) => {
  const target = needle.toLowerCase().replace(/\s+/g, ' ');
  const key = Object.keys(row).find(
    (k) => k.replace(/\s+/g, ' ').toLowerCase() === target
      || k.replace(/\s+/g, ' ').toLowerCase().includes(target)
  );
  return key ? row[key] : null;
};

const slugCode = (text, fallback) => {
  const slug = String(text || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);
  return slug || fallback;
};

const buildRangePriceMap = (workbook) => {
  const ws = workbook.Sheets[SHEET_RANGE];
  const map = new Map();
  if (!ws) return map;
  const rows = XLSX.utils.sheet_to_json(ws, { defval: null, raw: true });
  rows.forEach((row) => {
    const description = toText(getField(row, 'EKOOMS Colour Description'));
    const price = toNumber(getField(row, 'Board Pricer per m'));
    if (!description || price == null) return;
    map.set(description.toUpperCase(), price);
    const colour = toText(getField(row, 'Colour'));
    const finish = toText(getField(row, 'Finish'));
    if (colour) map.set(`${colour} ${finish}`.toUpperCase(), price);
  });
  return map;
};

const seedBoards = async (workbook) => {
  const ws = workbook.Sheets[SHEET_BOARDS];
  if (!ws) throw new Error(`Missing sheet ${SHEET_BOARDS}`);
  const rows = XLSX.utils.sheet_to_json(ws, { defval: null, raw: true });
  const rangePrices = buildRangePriceMap(workbook);

  const docs = [];
  const usedCodes = new Set();
  rows.forEach((row, index) => {
    const description = toText(
      row['Board Description'] || row['Colour Description']
    );
    if (!description) return;
    const sage = toText(getField(row, 'Sage Board Code')).toUpperCase();
    const ekooms = toText(getField(row, 'EKOOMS Colour ID'));
    let boardCode = sage || (ekooms ? `EK-${ekooms}` : slugCode(description, `BOARD-${index + 1}`));
    if (usedCodes.has(boardCode)) boardCode = `${boardCode}-${index + 1}`;
    usedCodes.add(boardCode);

    const active = toText(row['Active (Y/N)']).toUpperCase();
    docs.push({
      boardCode,
      description,
      supplier: toText(row.Manufacturer),
      range: toText(row.Range),
      colour: toText(row['Colour Description']),
      finish: toText(row.Finish),
      boardType: toText(row['Purchase Type']),
      height: toNumber(row.H),
      width: toNumber(row.W),
      thickness: toNumber(row.T),
      costPerM2:
        toNumber(getField(row, 'Cost per square meter')) ??
        rangePrices.get(description.toUpperCase()) ??
        rangePrices.get(toText(row['Colour Description']).toUpperCase()) ??
        null,
      ekoomsColourId: ekooms,
      isActive: active !== 'N',
      deletedAt: null,
    });
  });

  const rangeWs = workbook.Sheets[SHEET_RANGE];
  if (rangeWs) {
    const rangeRows = XLSX.utils.sheet_to_json(rangeWs, { defval: null, raw: true });
    rangeRows.forEach((row, index) => {
      const description = toText(getField(row, 'EKOOMS Colour Description'));
      if (!description) return;
      const price = toNumber(getField(row, 'Board Pricer per m'));
      const existing = docs.find(
        (d) => d.description.toUpperCase() === description.toUpperCase()
      );
      if (existing) {
        if (existing.costPerM2 == null && price != null) existing.costPerM2 = price;
        return;
      }
      let boardCode = slugCode(description, `RANGE-${index + 1}`);
      if (usedCodes.has(boardCode)) boardCode = `BR-${boardCode}-${index + 1}`;
      usedCodes.add(boardCode);
      docs.push({
        boardCode,
        description,
        supplier: toText(getField(row, 'Supplier')),
        range: toText(getField(row, 'Range')),
        colour: toText(getField(row, 'Colour')),
        finish: toText(getField(row, 'Finish')),
        boardType: toText(getField(row, 'Board Type')),
        height: toNumber(getField(row, 'Height')),
        width: toNumber(getField(row, 'Width')),
        thickness: toNumber(getField(row, 'Thickness')),
        costPerM2: price,
        ekoomsColourId: '',
        isActive: toText(getField(row, 'Status')).toLowerCase() !== 'inactive',
        deletedAt: null,
      });
    });
  }

  await Board.deleteMany({});
  if (docs.length) await Board.insertMany(docs, { ordered: false });
  return docs.length;
};

const seedEdging = async (workbook) => {
  const ws = workbook.Sheets[SHEET_EDGING];
  if (!ws) throw new Error(`Missing sheet ${SHEET_EDGING}`);
  const matrix = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, raw: true });
  let headerRow = 0;
  for (let i = 0; i < Math.min(10, matrix.length); i += 1) {
    const row = (matrix[i] || []).map((c) => String(c || '').toLowerCase());
    if (row.some((c) => c.includes('colour description'))) {
      headerRow = i;
      break;
    }
  }
  const headers = (matrix[headerRow] || []).map((c) => String(c || '').trim());
  const docs = [];
  for (let i = headerRow + 1; i < matrix.length; i += 1) {
    const cells = matrix[i] || [];
    const obj = {};
    headers.forEach((h, idx) => {
      obj[h] = cells[idx];
    });
    const colourDescription = toText(obj['Colour Description']);
    if (!colourDescription) continue;
    docs.push({
      colourDescription,
      priceGroup: toText(obj['Price Group']),
      costPrice: toNumber(obj['Cost Price']),
      retailPrice: toNumber(obj['Retail Price']),
      isActive: true,
      deletedAt: null,
    });
  }

  await EdgingColour.deleteMany({});
  if (docs.length) await EdgingColour.insertMany(docs, { ordered: false });
  return docs.length;
};

const main = async () => {
  const filePath = DEFAULT_NCL_PATH;
  if (!fs.existsSync(filePath)) throw new Error(`NCL workbook not found: ${filePath}`);
  await connectDatabase();
  console.log('Reading', filePath);
  const workbook = XLSX.readFile(filePath, {
    sheets: [SHEET_BOARDS, SHEET_RANGE, SHEET_EDGING],
    cellDates: false,
  });
  const boards = await seedBoards(workbook);
  const edging = await seedEdging(workbook);
  console.log(`Boards upserted: ${boards}`);
  console.log(`Edging colours upserted: ${edging}`);
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
