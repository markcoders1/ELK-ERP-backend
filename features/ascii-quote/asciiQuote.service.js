/**
 * Quote a Winner ASCII design using ELK catalogue / Hardware Master / NCL boards.
 * ASCII monetary fields are never used.
 */

const Component = require('../components/component.model');
const HardwareItem = require('../hardware/hardwareItem.model');
const Board = require('../boards/board.model');
const EdgingColour = require('../edging/edgingColour.model');
const EasylifeItem = require('../easylife-items/easylifeItem.model');
const { parseWinnerAscii, isDimensionCode } = require('./winnerParser');
const { calculateHardwarePricing } = require('../hardware/hardwarePricing.service');
const { COMPONENT_VERSION_STATUS, ROLES } = require('../../config/constants');

const liveComponentFilter = {
  versionStatus: COMPONENT_VERSION_STATUS.APPROVED,
  deletedAt: null,
};

const roundMoney = (value) => {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return null;
  return Math.round(Number(value) * 100) / 100;
};

const hideConsultantCosts = (role) => role === ROLES.CONSULTANT;

const fold = (value) =>
  String(value || '')
    .toLowerCase()
    .replace(/bisonlam/g, 'bison')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const unmatched = (reason) => ({
  matchType: 'UNMATCHED',
  matchedCode: null,
  matchedDescription: null,
  matchedId: null,
  unitRetail: null,
  unitHwCost: null,
  unitHwRetail: null,
  priceSource: reason,
});

const lookupComponent = (productCode, cityCode, ctx) => {
  if (!productCode) return null;
  if (cityCode) {
    const regional = ctx.components.find(
      (row) => row.componentCode === productCode && row.region === cityCode
    );
    if (regional) return regional;
  }
  return ctx.components.find((row) => row.componentCode === productCode) || null;
};

const lookupHardware = (productCode, ctx) => {
  if (!productCode) return null;
  return ctx.hardware.get(productCode) || null;
};

const lookupEasylife = (productCode, cityCode, ctx) => {
  if (!productCode) return null;
  const exact = ctx.easylife.get(productCode);
  if (exact && (exact.pg1Price != null || Object.values(exact.pgPrices || {}).some((n) => Number(n) > 0))) {
    return exact;
  }
  if (!cityCode) return exact || null;
  const suffix = cityCode === 'JHB' ? ['_JH', '_JHB', '-JH'] : ['_CT', '_CPT', '-CT'];
  for (const end of suffix) {
    const row = ctx.easylife.get(`${productCode}${end}`);
    if (row && row.pg1Price != null) return row;
  }
  return exact || null;
};

const firstPgPrice = (doc) => {
  if (doc.pg1Price != null && Number(doc.pg1Price) > 0) return Number(doc.pg1Price);
  const prices = doc.pgPrices || {};
  const first = Object.keys(prices)
    .sort((a, b) => Number(String(a).replace(/\D/g, '')) - Number(String(b).replace(/\D/g, '')))
    .map((k) => Number(prices[k]))
    .find((n) => n > 0);
  return first != null ? first : null;
};

const normalizeQuantityUnit = (raw, matchType) => {
  if (matchType === 'BOARD') return 'm²';
  if (matchType === 'EDGING') return 'm';
  const unit = String(raw || '').toLowerCase();
  if (unit.includes('m2') || unit.includes('m²') || unit.includes('sq')) return 'm²';
  if (unit === 'm' || unit.includes('lm') || unit.includes('metre') || unit.includes('meter')) {
    return 'm';
  }
  return 'ea';
};

const priceFromEasylife = (doc, quantity) => {
  const unit = String(doc.unit || 'ea').toLowerCase();
  const unitRetail = roundMoney(firstPgPrice(doc));
  const isArea = unit.includes('m2') || unit.includes('m²');
  const qtyOverride = isArea ? Number(quantity) || null : null;
  return {
    matchType: 'EASYLIFE',
    matchedCode: doc.code,
    matchedDescription: doc.description,
    matchedId: String(doc._id),
    unitRetail,
    unitHwCost: null,
    unitHwRetail: unitRetail,
    quantityOverride: qtyOverride,
    quantityUnit: normalizeQuantityUnit(doc.unit, 'EASYLIFE'),
    priceSource: `Easylife National (${doc.sourceSheet}) PG1. ASCII job price ignored.`,
  };
};

const applyCityToHardware = (doc, cityCode) => {
  const regional = doc.regionalCosts || {};
  const cpt = regional.cpt;
  const jhb = regional.jhb;
  if (cityCode === 'CPT' && cpt != null) {
    return { ...doc, regionalCosts: { ...regional, cpt, jhb: cpt } };
  }
  if (cityCode === 'JHB' && jhb != null) {
    return { ...doc, regionalCosts: { ...regional, cpt: jhb, jhb } };
  }
  return doc;
};

const priceFromComponent = (doc) => {
  const metrics = doc.catalogueMetrics || {};
  const stored = Number(doc.retailPrice);
  const retail =
    Number.isFinite(stored) && stored > 0
      ? roundMoney(stored)
      : roundMoney(metrics.hwRetail);
  return {
    matchType: 'CATALOGUE',
    matchedCode: doc.componentCode,
    matchedDescription: doc.description,
    matchedId: String(doc._id),
    unitRetail: retail,
    unitHwCost: roundMoney(metrics.hwCost),
    unitHwRetail: roundMoney(metrics.hwRetail),
    priceSource:
      'ELK Carcasses & BIC Catalogue Super White. If Excel Super White is N/A, HW Retail from cascade is used. ASCII price ignored.',
  };
};

const priceFromHardware = (doc, cityCode) => {
  const priced = calculateHardwarePricing(applyCityToHardware(doc, cityCode));
  return {
    matchType: 'HARDWARE',
    matchedCode: doc.stockCode,
    matchedDescription: doc.description,
    matchedId: String(doc._id),
    unitRetail: roundMoney(priced.retailPriceExVat),
    unitHwCost: roundMoney(priced.mnfPrice ?? priced.agreed),
    unitHwRetail: roundMoney(priced.retailPriceExVat),
    priceSource: cityCode
      ? `ELK Hardware Master (${cityCode} cost into Excel MNF/FRC/RET formulas). ASCII price ignored.`
      : 'ELK Hardware Master File (Excel MAX CPT/JHB). ASCII price ignored.',
  };
};

const findBoardByColour = (colourName, boards = []) => {
  const needle = fold(colourName);
  if (!needle || !boards.length) return null;
  const scored = boards
    .map((board) => {
      const hay = fold(`${board.colour} ${board.description} ${board.finish} ${board.range}`);
      if (!hay) return null;
      if (hay === needle) return { board, score: 100 };
      if (hay.includes(needle) || needle.includes(hay)) return { board, score: 80 };
      const tokens = needle.split(' ').filter((t) => t.length > 2);
      const hits = tokens.filter((t) => hay.includes(t)).length;
      if (tokens.length && hits >= Math.min(2, tokens.length)) return { board, score: hits };
      return null;
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score);
  return scored[0]?.board || null;
};

const findEdgingByColour = (colourName, rows) => {
  const needle = fold(colourName);
  if (!rows?.length) return null;
  if (!needle) {
    return rows.find((r) => /super white/i.test(r.colourDescription)) || rows[0];
  }
  const scored = rows
    .map((row) => {
      const hay = fold(row.colourDescription);
      if (hay === needle) return { row, score: 100 };
      if (hay.includes(needle) || needle.includes(hay)) return { row, score: 80 };
      return null;
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score);
  return (
    scored[0]?.row ||
    rows.find((r) => /super white/i.test(r.colourDescription)) ||
    null
  );
};

const boardAreaM2 = (product) => {
  const qty = Number(product.quantity);
  const unit = String(product.unit || '').toLowerCase();
  if (qty && (unit.includes('m2') || unit.includes('m²') || unit.includes('sq'))) {
    return qty;
  }
  const width = product.dimensions?.widthMm;
  const height = product.dimensions?.heightMm;
  if (width && height) return (Number(width) * Number(height)) / 1e6;
  return qty || null;
};

const priceCutBoard = (product, ctx) => {
  const colour = product.boardColour || product.carcassMaterial;
  const board = findBoardByColour(colour, ctx.boards);
  const area = boardAreaM2(product);
  if (!board || board.costPerM2 == null || !area) {
    return unmatched(
      board
        ? 'Board colour matched on NCL Board List_arch but Cost per m² or cut area is missing.'
        : `No NCL Board List_arch row for colour "${colour || 'unknown'}". ASCII board price ignored.`
    );
  }
  const unitRetail = roundMoney(board.costPerM2);
  return {
    matchType: 'BOARD',
    matchedCode: board.boardCode,
    matchedDescription: board.description,
    matchedId: String(board._id),
    unitRetail,
    unitHwCost: unitRetail,
    unitHwRetail: unitRetail,
    quantityOverride: area,
    quantityUnit: 'm²',
    priceSource: `NCL Board List_arch cost/m² × ${roundMoney(area)} m² (${board.description}). ASCII price ignored.`,
  };
};

const priceBoardEdging = (product, ctx) => {
  const colour = product.boardColour || product.carcassMaterial;
  const edging = findEdgingByColour(colour, ctx.edgings);
  const meters = Number(product.quantity) || 0;
  if (!edging || edging.retailPrice == null) {
    return unmatched(
      'No NCL Edging Colour Range retail for this board colour. ASCII edging price ignored.'
    );
  }
  return {
    matchType: 'EDGING',
    matchedCode: edging.priceGroup || 'EDGING',
    matchedDescription: edging.colourDescription,
    matchedId: String(edging._id),
    unitRetail: roundMoney(edging.retailPrice),
    unitHwCost: roundMoney(edging.costPrice),
    unitHwRetail: roundMoney(edging.retailPrice),
    quantityUnit: 'm',
    priceSource: `NCL Edging Colour Range retail/m × ${meters} m. ASCII price ignored.`,
  };
};

const quoteProduct = (product, { cityCode, ctx, allowCuttingSkip = false } = {}) => {
  const code = String(product.productCode || '').toUpperCase();
  if (!code) return unmatched('No product code on ASCII line.');

  if (code === 'BOARD/E1L' || code.startsWith('BOARD/')) {
    const ncl = priceCutBoard(product, ctx);
    if (ncl.matchType === 'BOARD') return ncl;
    const easylifeBoard = lookupEasylife(code, cityCode, ctx);
    if (easylifeBoard && firstPgPrice(easylifeBoard) != null) {
      return priceFromEasylife(easylifeBoard, product.quantity);
    }
    return ncl;
  }
  if (code === 'BOARD_EDGING' || code === 'BOARD-EDGING') {
    return priceBoardEdging(product, ctx);
  }

  const component = lookupComponent(code, cityCode, ctx);
  if (component) return priceFromComponent(component);

  const hardware = lookupHardware(code, ctx);
  if (hardware) return priceFromHardware(hardware, cityCode);

  const easylife = lookupEasylife(code, cityCode, ctx);
  if (easylife && firstPgPrice(easylife) != null) {
    return priceFromEasylife(easylife, product.quantity);
  }

  if (allowCuttingSkip && isDimensionCode(code)) {
    return unmatched(
      'Door/front cutting size with no Easylife Doors Import PG1. Not priced (avoids inventing a door rate).'
    );
  }

  return unmatched(
    'No live ELK catalogue, Hardware Master, NCL board/edging, or Easylife Import row for this code. ASCII price was not used.'
  );
};

const attachMoney = (qty, pricing, unitHint) => {
  const quantity = Number(pricing.quantityOverride ?? qty) || 0;
  const { quantityOverride, ...rest } = pricing;
  return {
    ...rest,
    billedQuantity: quantity,
    quantityUnit: rest.quantityUnit || normalizeQuantityUnit(unitHint, rest.matchType),
    lineRetail:
      rest.unitRetail != null ? roundMoney(rest.unitRetail * quantity) : null,
  };
};

const sanitizeForRole = (pricing, role) => {
  if (!hideConsultantCosts(role)) return pricing;
  return {
    ...pricing,
    unitHwCost: null,
    unitHwRetail: pricing.matchType === 'HARDWARE' ? pricing.unitHwRetail : null,
  };
};

const loadQuoteContext = async (codes) => {
  const unique = [...new Set(codes.filter(Boolean))];
  const extra = [];
  unique.forEach((code) => {
    extra.push(`${code}_CT`, `${code}_CPT`, `${code}_JH`, `${code}_JHB`);
  });
  const lookupCodes = [...new Set([...unique, ...extra])];
  const [boards, edgings, components, hardwareRows, easylifeRows] = await Promise.all([
    Board.find({ deletedAt: null, isActive: { $ne: false } }).lean(),
    EdgingColour.find({ deletedAt: null }).lean(),
    lookupCodes.length
      ? Component.find({ componentCode: { $in: lookupCodes }, ...liveComponentFilter }).lean()
      : [],
    lookupCodes.length
      ? HardwareItem.find({ stockCode: { $in: lookupCodes }, deletedAt: null }).lean()
      : [],
    lookupCodes.length ? EasylifeItem.find({ code: { $in: lookupCodes } }).lean() : [],
  ]);

  const hardware = new Map();
  hardwareRows.forEach((row) => {
    hardware.set(row.stockCode, row);
    hardware.set(String(row.stockCode || '').toUpperCase(), row);
  });
  const easylife = new Map();
  easylifeRows.forEach((row) => {
    easylife.set(row.code, row);
    easylife.set(String(row.code || '').toUpperCase(), row);
  });
  return { boards, edgings, components, hardware, easylife };
};

const quoteAsciiDesign = async (fileText, { role } = {}) => {
  const parsed = parseWinnerAscii(fileText);
  const cityCode = parsed.header.cityCode || '';

  const allCodes = [];
  parsed.products.forEach((product) => {
    allCodes.push(product.productCode);
    (product.children || []).forEach((child) => allCodes.push(child.productCode));
  });
  const ctx = await loadQuoteContext(allCodes);

  const lines = parsed.products.map((product) => {
    const pricing = attachMoney(
      product.quantity,
      quoteProduct(product, { cityCode, ctx }),
      product.unit
    );

    const children = (product.children || []).map((child) => {
      const childPricing = attachMoney(
        child.quantity,
        quoteProduct(
          {
            ...child,
            boardColour: product.boardColour,
            carcassMaterial: product.carcassMaterial,
            dimensions: product.dimensions,
          },
          { cityCode, ctx, allowCuttingSkip: true }
        ),
        child.unit
      );
      return {
        productCode: child.productCode,
        description: child.description,
        quantity: child.quantity,
        unit: child.unit,
        isCuttingListFront: child.isCuttingListFront,
        ...sanitizeForRole(childPricing, role),
      };
    });

    return {
      sourceLineId: product.sourceLineId,
      productCode: product.productCode,
      description: product.description,
      quantity: product.quantity,
      unit: product.unit,
      category: product.category,
      orientation: product.orientation,
      carcassMaterial: product.carcassMaterial,
      boardColour: product.boardColour,
      library: product.library,
      rangeName: product.rangeName,
      dimensions: product.dimensions,
      settings: product.settings,
      children,
      ...sanitizeForRole(pricing, role),
    };
  });

  const matched = lines.filter((line) => line.matchType !== 'UNMATCHED');
  const unmatchedLines = lines.filter((line) => line.matchType === 'UNMATCHED');
  const quotedRetail = roundMoney(
    matched.reduce((sum, line) => sum + (line.lineRetail || 0), 0)
  );

  return {
    header: parsed.header,
    summary: {
      asciiLineCount: parsed.lineCount,
      matchedCount: matched.length,
      unmatchedCount: unmatchedLines.length,
      quotedRetail,
      asciiPricesIgnored: true,
      quoteCity: parsed.header.city || null,
      quoteCityCode: cityCode || null,
      defaultFinishNote:
        'Catalogue units use stored Super White (or cascaded HW Retail if Super White is N/A). Winner city prices are ignored. Hardware uses CPT or JHB from Hardware Master for the job city.',
      emptyKitchenNote:
        parsed.unitRecordCount === 0
          ? 'This ASCII file has a job header but no cabinet/product records (Winner type 500). It is an empty or demo kitchen (only setup + default knobs). Add units in Winner and export again to quote.'
          : null,
    },
    lines,
  };
};

module.exports = {
  quoteAsciiDesign,
};
