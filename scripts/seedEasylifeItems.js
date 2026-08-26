/**
 * Load Easylife National Winner Import SKUs + PG1 prices.
 * Does not touch Hardware Master, NCL catalogue, or cascade.
 *
 *   npm run seed:easylife-items
 */

require('dotenv').config();
const fs = require('fs');
const mongoose = require('mongoose');
const XLSX = require('xlsx');
const connectDatabase = require('../config/database');
const EasylifeItem = require('../features/easylife-items/easylifeItem.model');

const DEFAULT_PATH =
  process.env.EASYLIFE_XLSX_PATH ||
  '/home/syed-ahad/Downloads/Easylife National 2026 May 28.xlsx';

const SHEETS = [
  '4.1 Boards Import',
  '1.1 Doors Import',
  '1.2 White Carcasses Import',
  '2.1 Coloured Carcasses Import',
  '8.Hardware',
  '7. Miscellaneous',
  '6.1 Lightshields Import',
  '10. CPT Worktops Import',
];

const toNumber = (value) => {
  if (value === '' || value === null || value === undefined) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

const toText = (value) => (value == null ? '' : String(value).trim());

const normalizeKeys = (row) => {
  const out = {};
  Object.entries(row).forEach(([key, value]) => {
    out[String(key).replace(/\s+/g, ' ').trim()] = value;
  });
  return out;
};

const skipCode = (code) => {
  if (!code) return true;
  const u = code.toUpperCase();
  if (u.startsWith('ALTERED')) return true;
  if (u.includes('PRICE PER')) return true;
  if (u.length < 2) return true;
  return false;
};

const extractFromSheet = (workbook, sheetName) => {
  const ws = workbook.Sheets[sheetName];
  if (!ws) {
    console.log('  skip missing sheet', sheetName);
    return [];
  }
  const rawRows = XLSX.utils.sheet_to_json(ws, { defval: '', raw: true });
  const docs = [];
  rawRows.forEach((raw) => {
    const row = normalizeKeys(raw);
    const code = toText(row.Code).toUpperCase();
    if (skipCode(code)) return;
    const pgPrices = {};
    Object.keys(row).forEach((key) => {
      if (/^PG\d+$/i.test(key.replace(/\s/g, ''))) {
        const n = toNumber(row[key]);
        if (n != null) pgPrices[key.replace(/\s/g, '').toUpperCase()] = n;
      }
    });
    const pg1 =
      toNumber(row.PG1) ??
      toNumber(row['PG1']) ??
      pgPrices.PG1 ??
      Object.keys(pgPrices)
        .sort((a, b) => Number(a.replace(/\D/g, '')) - Number(b.replace(/\D/g, '')))
        .map((k) => pgPrices[k])
        .find((n) => n > 0) ??
      null;
    docs.push({
      code,
      description: toText(row.Description),
      unit: toText(row['Unit (text)']) || 'ea',
      placement: toText(row.Placement),
      sourceSheet: sheetName,
      productGroupName: toText(
        row['Productgroup Name'] ||
          row['ProductGroup Name'] ||
          row['Product Group name'] ||
          row['Product Group Name']
      ),
      searchGroupName: toText(
        row['Searchgroup Name'] || row['Searchgroup Name'] || row['Search group name']
      ),
      pg1Price: pg1,
      pgPrices,
    });
  });
  return docs;
};

const main = async () => {
  if (!fs.existsSync(DEFAULT_PATH)) {
    throw new Error(`Easylife workbook not found: ${DEFAULT_PATH}`);
  }
  await connectDatabase();
  console.log('Reading', DEFAULT_PATH);
  const workbook = XLSX.readFile(DEFAULT_PATH, { sheets: SHEETS, cellDates: false });

  const byCode = new Map();
  SHEETS.forEach((sheet) => {
    const docs = extractFromSheet(workbook, sheet);
    console.log(`  ${sheet}: ${docs.length} rows`);
    docs.forEach((doc) => {
      const existing = byCode.get(doc.code);
      if (!existing) {
        byCode.set(doc.code, doc);
        return;
      }
      if ((existing.pg1Price == null || existing.pg1Price === 0) && doc.pg1Price) {
        byCode.set(doc.code, doc);
      }
    });
  });

  const all = [...byCode.values()];
  await EasylifeItem.deleteMany({});
  if (all.length) await EasylifeItem.insertMany(all, { ordered: false });
  console.log(`Easylife items stored: ${all.length}`);
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
