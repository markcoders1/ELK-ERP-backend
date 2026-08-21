const HwComponentLine = require('./hwComponentLine.model');
const AppError = require('../../utils/AppError');
const { HTTP_STATUS } = require('../../config/constants');
const { parsePagination, buildPaginationMeta } = require('../../shared/pagination');
const { escapeRegex } = require('../../shared/escapeRegex');
const HardwareItemRange = require('../hardware-item-range/hardwareItemRange.model');

const notDeletedFilter = { deletedAt: null };

const normalizeCode = (code) => String(code || '').trim().toUpperCase();

const toOptionalNumber = (value) => {
  if (value === '' || value === null || value === undefined) return undefined;
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
};

const roundMoney = (value) => {
  if (value === null || value === undefined || Number.isNaN(value)) return null;
  return Math.round(value * 10000) / 10000;
};

const SORT_FIELDS = [
  'productCode',
  'hardwareItem',
  'range',
  'category',
  'quantity',
  'totalCost',
  'createdAt',
  'updatedAt',
];

const findActiveById = (id) => HwComponentLine.findOne({ _id: id, ...notDeletedFilter });

const buildListFilter = (query) => {
  const filter = { ...notDeletedFilter };

  if (query.productCode) {
    filter.productCode = normalizeCode(query.productCode);
  }

  if (query.hardwareItem) {
    filter.hardwareItem = normalizeCode(query.hardwareItem);
  }

  if (query.range) {
    filter.range = query.range.trim();
  }

  if (query.category) {
    filter.category = query.category.trim();
  }

  if (query.search) {
    const term = escapeRegex(query.search.trim());
    filter.$or = [
      { productCode: new RegExp(term, 'i') },
      { hardwareItem: new RegExp(term, 'i') },
      { range: new RegExp(term, 'i') },
      { category: new RegExp(term, 'i') },
    ];
  }

  return filter;
};

const buildSort = (query) => {
  const sortBy = SORT_FIELDS.includes(query.sortBy) ? query.sortBy : 'productCode';
  const sortOrder = query.sortOrder === 'desc' ? -1 : 1;
  return { [sortBy]: sortOrder };
};

const findAll = async (query) => {
  const { page, limit, skip } = parsePagination(query);
  const filter = buildListFilter(query);
  const sort = buildSort(query);

  const [items, total] = await Promise.all([
    HwComponentLine.find(filter).sort(sort).skip(skip).limit(limit).lean(),
    HwComponentLine.countDocuments(filter),
  ]);

  return {
    items: items.map(HwComponentLine.toListObjectFromLean),
    pagination: buildPaginationMeta({ page, limit, total }),
  };
};

const findById = async (id) => {
  const item = await findActiveById(id);
  if (!item) {
    throw new AppError('HW component line not found', HTTP_STATUS.NOT_FOUND);
  }
  return item.toSafeObject();
};

const findByProductCode = async (productCode) => {
  const code = normalizeCode(productCode);
  const items = await HwComponentLine.find({
    productCode: code,
    ...notDeletedFilter,
  })
    .sort({ hardwareItem: 1 })
    .lean();

  const itemCodes = [...new Set(items.map((row) => row.hardwareItem).filter(Boolean))];
  const hirRows = itemCodes.length
    ? await HardwareItemRange.find({ itemCode: { $in: itemCodes } })
        .select('itemCode description manufacturingPrice')
        .lean()
    : [];
  const hirByCode = new Map(hirRows.map((row) => [row.itemCode, row]));

  return items.map((row) => {
    const base = HwComponentLine.toListObjectFromLean(row);
    const hir = hirByCode.get(row.hardwareItem);
    return {
      ...base,
      description: hir?.description || row.hardwareItem,
      manufacturingPrice: hir?.manufacturingPrice ?? null,
    };
  });
};

const resolveCostFromHir = async (hardwareItem) => {
  const itemCode = normalizeCode(hardwareItem);
  const hir = await HardwareItemRange.findOne({
    itemCode,
    isActive: true,
  }).lean();

  if (!hir || hir.manufacturingPrice == null) return null;
  return Number(hir.manufacturingPrice);
};

const applyCosts = (quantity, costPrice) => {
  const qty = Number(quantity) || 0;
  const cost = costPrice != null ? Number(costPrice) : null;
  return {
    costPrice: cost != null ? roundMoney(cost) : null,
    totalCost: cost != null ? roundMoney(qty * cost) : null,
  };
};

const create = async (payload) => {
  const hardwareItem = normalizeCode(payload.hardwareItem);
  const quantity = toOptionalNumber(payload.quantity) ?? 0;
  let costPrice = toOptionalNumber(payload.costPrice);

  if (costPrice === undefined) {
    costPrice = await resolveCostFromHir(hardwareItem);
  }

  const costs = applyCosts(quantity, costPrice);

  const item = await HwComponentLine.create({
    range: payload.range?.trim() || '',
    category: payload.category?.trim() || '',
    productCode: normalizeCode(payload.productCode),
    hardwareItem,
    quantity,
    itemCount: toOptionalNumber(payload.itemCount) ?? null,
    ...costs,
    checkInFc: payload.checkInFc?.trim() || '',
    checkInCatalogue: payload.checkInCatalogue?.trim() || '',
    matchInBoth: payload.matchInBoth?.trim() || '',
  });

  return item.toSafeObject();
};

const update = async (id, payload) => {
  const item = await findActiveById(id);
  if (!item) {
    throw new AppError('HW component line not found', HTTP_STATUS.NOT_FOUND);
  }

  if (payload.range !== undefined) item.range = payload.range.trim();
  if (payload.category !== undefined) item.category = payload.category.trim();
  if (payload.productCode !== undefined) {
    item.productCode = normalizeCode(payload.productCode);
  }
  if (payload.hardwareItem !== undefined) {
    item.hardwareItem = normalizeCode(payload.hardwareItem);
  }
  if (payload.quantity !== undefined) {
    item.quantity = toOptionalNumber(payload.quantity) ?? 0;
  }
  if (payload.itemCount !== undefined) {
    item.itemCount = toOptionalNumber(payload.itemCount) ?? null;
  }
  if (payload.checkInFc !== undefined) item.checkInFc = payload.checkInFc.trim();
  if (payload.checkInCatalogue !== undefined) {
    item.checkInCatalogue = payload.checkInCatalogue.trim();
  }
  if (payload.matchInBoth !== undefined) item.matchInBoth = payload.matchInBoth.trim();

  if (payload.costPrice !== undefined) {
    const costs = applyCosts(item.quantity, toOptionalNumber(payload.costPrice));
    item.costPrice = costs.costPrice;
    item.totalCost = costs.totalCost;
  } else if (
    payload.quantity !== undefined ||
    payload.hardwareItem !== undefined
  ) {
    const cost = await resolveCostFromHir(item.hardwareItem);
    const costs = applyCosts(item.quantity, cost);
    item.costPrice = costs.costPrice;
    item.totalCost = costs.totalCost;
  }

  await item.save();
  return item.toSafeObject();
};

/**
 * Upsert a line keyed by productCode + hardwareItem (import / sync helper).
 */
const upsertLine = async (payload) => {
  const productCode = normalizeCode(payload.productCode);
  const hardwareItem = normalizeCode(payload.hardwareItem);

  if (!productCode || !hardwareItem) {
    throw new AppError(
      'productCode and hardwareItem are required',
      HTTP_STATUS.BAD_REQUEST
    );
  }

  const quantity = toOptionalNumber(payload.quantity) ?? 0;
  let costPrice = toOptionalNumber(payload.costPrice);
  if (costPrice === undefined) {
    costPrice = await resolveCostFromHir(hardwareItem);
  }
  const costs = applyCosts(quantity, costPrice);

  const doc = await HwComponentLine.findOneAndUpdate(
    { productCode, hardwareItem, ...notDeletedFilter },
    {
      $set: {
        range: payload.range?.trim() || '',
        category: payload.category?.trim() || '',
        productCode,
        hardwareItem,
        quantity,
        itemCount: toOptionalNumber(payload.itemCount) ?? null,
        ...costs,
        checkInFc: payload.checkInFc?.trim() || '',
        checkInCatalogue: payload.checkInCatalogue?.trim() || '',
        matchInBoth: payload.matchInBoth?.trim() || '',
        deletedAt: null,
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  return doc.toSafeObject();
};

/**
 * Recalculate COST PRICE / TOTAL for all lines referencing a hardware stock code.
 * COST = HIR manufacturingPrice; TOTAL = QTY × COST.
 */
const recalculateCostsForHardwareItem = async (itemCode) => {
  const code = normalizeCode(itemCode);
  const costPrice = await resolveCostFromHir(code);
  const roundedCost = costPrice != null ? roundMoney(costPrice) : null;

  const lines = await HwComponentLine.find({
    hardwareItem: code,
    ...notDeletedFilter,
  })
    .select('_id quantity')
    .lean();

  if (!lines.length) {
    return { itemCode: code, linesUpdated: 0, costPrice: roundedCost };
  }

  const ops = lines.map((line) => {
    const qty = Number(line.quantity) || 0;
    return {
      updateOne: {
        filter: { _id: line._id },
        update: {
          $set: {
            costPrice: roundedCost,
            totalCost:
              roundedCost != null ? roundMoney(qty * roundedCost) : null,
          },
        },
      },
    };
  });

  await HwComponentLine.bulkWrite(ops, { ordered: false });

  return { itemCode: code, linesUpdated: lines.length, costPrice: roundedCost };
};

const softDelete = async (id) => {
  const item = await findActiveById(id);
  if (!item) {
    throw new AppError('HW component line not found', HTTP_STATUS.NOT_FOUND);
  }

  item.deletedAt = new Date();
  await item.save();
  return item.toSafeObject();
};

/**
 * Distinct product codes that reference a hardware item (for cascade).
 */
const distinctProductCodesForHardwareItem = async (itemCode) => {
  const code = normalizeCode(itemCode);
  return HwComponentLine.distinct('productCode', {
    hardwareItem: code,
    ...notDeletedFilter,
  });
};

/**
 * Sum totalCost for a product (catalogue HW Cost).
 */
const sumTotalCostForProduct = async (productCode) => {
  const code = normalizeCode(productCode);
  const rows = await HwComponentLine.find({
    productCode: code,
    ...notDeletedFilter,
  })
    .select('totalCost')
    .lean();

  return rows.reduce((sum, row) => sum + (Number(row.totalCost) || 0), 0);
};

module.exports = {
  findAll,
  findById,
  findByProductCode,
  create,
  update,
  upsertLine,
  recalculateCostsForHardwareItem,
  softDelete,
  distinctProductCodesForHardwareItem,
  sumTotalCostForProduct,
  normalizeCode,
};
