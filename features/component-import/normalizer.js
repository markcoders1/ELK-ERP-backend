const { SECTION_TYPES } = require('../../config/constants');

/**
 * Component BOM column aliases (tolerant).
 * One row = one component header; child sections may be JSON columns
 * or repeated section-typed sheets later.
 */
const COLUMN_ALIASES = {
  componentCode: ['COMPONENT CODE', 'COMPONENTCODE', 'CODE', 'STOCK CODE', 'PRODUCT CODE'],
  description: ['DESCRIPTION', 'DESC', 'NAME'],
  category: ['CATEGORY', 'CAT'],
  finish: ['FINISH', 'FINISHING'],
  status: ['STATUS', 'ACTIVE'],
  retailPrice: ['RETAIL', 'RETAIL PRICE', 'RETAILPRICE', 'PRICE'],
  length: ['LENGTH', 'L', 'DIM LENGTH'],
  width: ['WIDTH', 'W', 'DIM WIDTH'],
  height: ['HEIGHT', 'H', 'DIM HEIGHT'],
  boards: ['BOARDS', 'BOARD LINES', 'BOARD JSON'],
  hardware: ['HARDWARE', 'HARDWARE LINES', 'HW JSON'],
  factory: ['FACTORY', 'FACTORY OPS', 'OPERATIONS', 'FACTORY JSON'],
  variants: ['VARIANTS', 'FINISHES', 'VARIANT JSON'],
};

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
    aliases.forEach((alias) => aliasToField.set(normalizeHeaderKey(alias), field));
  });

  const lookup = {};
  headers.forEach((header) => {
    const field = aliasToField.get(normalizeHeaderKey(header));
    if (field) lookup[field] = header;
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

const normalizeNumber = (value) => {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;

  let text = stripInvisible(value);
  if (!text) return null;
  text = text.replace(/^R\s*/i, '').replace(/\s/g, '');
  if (text.includes(',') && !text.includes('.')) text = text.replace(',', '.');
  else text = text.replace(/,/g, '');
  text = text.replace(/[^0-9.+-]/g, '');
  const number = Number(text);
  return Number.isFinite(number) ? number : null;
};

const parseJsonArray = (value) => {
  if (value == null || value === '') return [];
  if (Array.isArray(value)) return value;
  if (typeof value === 'object') return [value];

  const text = stripInvisible(value);
  if (!text) return [];

  try {
    const parsed = JSON.parse(text);
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    // Pipe-delimited fallback: name:qty:cost|name:qty:cost
    return text
      .split('|')
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const [a, b, c, d] = part.split(':').map((p) => p.trim());
        return { name: a, quantity: b, cost: c, notes: d };
      });
  }
};

const mapBoardItems = (rows) =>
  rows.map((row, idx) => ({
    quantity: normalizeNumber(row.quantity ?? row.qty) ?? 1,
    notes: row.notes || '',
    unitCost: normalizeNumber(row.calculatedCost ?? row.cost ?? row.unitCost),
    attributes: {
      partName: row.partName || row.name || '',
      boardType: row.boardType || row.type || '',
      material: row.material || '',
      length: normalizeNumber(row.length),
      width: normalizeNumber(row.width),
      thickness: normalizeNumber(row.thickness),
      area: normalizeNumber(row.area),
      linearMetres: normalizeNumber(row.linearMetres),
      wastePercent: normalizeNumber(row.wastePercent ?? row.waste),
      calculatedCost: normalizeNumber(row.calculatedCost ?? row.cost),
      notes: row.notes || '',
    },
    sortOrder: idx,
  }));

const mapHardwareItems = (rows) =>
  rows.map((row, idx) => ({
    quantity: normalizeNumber(row.quantity ?? row.qty) ?? 1,
    notes: row.notes || row.overrideNotes || '',
    hardwareId: row.hardwareId || null,
    attributes: {
      hardwareId: row.hardwareId || null,
      stockCode: row.stockCode || row.code || '',
      notes: row.notes || row.overrideNotes || '',
    },
    sortOrder: idx,
  }));

const mapFactoryItems = (rows) =>
  rows.map((row, idx) => ({
    quantity: normalizeNumber(row.quantity ?? row.qty) ?? 1,
    notes: row.notes || '',
    unitCost: normalizeNumber(row.cost ?? row.unitCost),
    attributes: {
      name: row.name || row.operation || '',
      unit: row.unit || '',
      cost: normalizeNumber(row.cost ?? row.unitCost),
      notes: row.notes || '',
    },
    sortOrder: idx,
  }));

const mapVariantItems = (rows) =>
  rows.map((row, idx) => ({
    quantity: 1,
    notes: row.notes || '',
    unitCost: normalizeNumber(row.cost),
    attributes: {
      finishName: row.finishName || row.name || row.finish || '',
      retailPrice: normalizeNumber(row.retailPrice ?? row.retail),
      cost: normalizeNumber(row.cost),
      markup: normalizeNumber(row.markup),
      status: row.status || 'Active',
    },
    sortOrder: idx,
  }));

const normalizeComponentRow = (rawRow, headerLookup) => {
  const get = (field) => {
    const header = headerLookup[field];
    if (!header) return null;
    return emptyToNull(rawRow[header]);
  };

  const componentCode = stripInvisible(get('componentCode') || '');
  const description = stripInvisible(get('description') || '');

  const boardItems = mapBoardItems(parseJsonArray(get('boards')));
  const hardwareItems = mapHardwareItems(parseJsonArray(get('hardware')));
  const factoryItems = mapFactoryItems(parseJsonArray(get('factory')));
  const variantItems = mapVariantItems(parseJsonArray(get('variants')));

  const header = {
    componentCode: componentCode ? componentCode.toUpperCase() : '',
    description,
    category: stripInvisible(get('category') || ''),
    finish: stripInvisible(get('finish') || ''),
    status: stripInvisible(get('status') || '') || 'Active',
    retailPrice: normalizeNumber(get('retailPrice')),
    dimensions: {
      length: normalizeNumber(get('length')),
      width: normalizeNumber(get('width')),
      height: normalizeNumber(get('height')),
      unit: 'mm',
    },
    isActive: true,
  };

  const sections = [
    {
      sectionType: SECTION_TYPES.BOARD,
      name: 'Boards',
      sortOrder: 0,
      meta: {},
      items: boardItems,
    },
    {
      sectionType: SECTION_TYPES.HARDWARE,
      name: 'Hardware',
      sortOrder: 1,
      meta: {},
      items: hardwareItems,
    },
    {
      sectionType: SECTION_TYPES.FACTORY,
      name: 'Factory Operations',
      sortOrder: 2,
      meta: {},
      items: factoryItems,
    },
    {
      sectionType: SECTION_TYPES.VARIANT,
      name: 'Finish Variants',
      sortOrder: 3,
      meta: {},
      items: variantItems,
    },
  ];

  return {
    normalized: { header, sections },
    display: {
      componentCode: header.componentCode,
      description: header.description,
      category: header.category,
      finish: header.finish,
      retailPrice: header.retailPrice,
      boardCount: boardItems.length,
      hardwareCount: hardwareItems.length,
      factoryCount: factoryItems.length,
      variantCount: variantItems.length,
    },
  };
};

module.exports = {
  buildHeaderLookup,
  normalizeComponentRow,
  normalizeNumber,
  parseJsonArray,
};
