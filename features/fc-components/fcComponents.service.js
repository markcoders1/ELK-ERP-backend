const FcComponentLine = require('./fcComponentLine.model');
const AppError = require('../../utils/AppError');
const { HTTP_STATUS } = require('../../config/constants');
const { parsePagination, buildPaginationMeta } = require('../../shared/pagination');
const { escapeRegex } = require('../../shared/escapeRegex');
const {
  calculateBoardM2,
  calculateEdgingLinearMeter,
} = require('./fcFormulas');

const notDeletedFilter = { deletedAt: null };

const normalizeCode = (code) => String(code || '').trim().toUpperCase();

const toOptionalNumber = (value) => {
  if (value === '' || value === null || value === undefined) return undefined;
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
};

const SORT_FIELDS = [
  'productCode',
  'component',
  'range',
  'category',
  'quantity',
  'boardM2',
  'createdAt',
  'updatedAt',
];

const findActiveById = (id) => FcComponentLine.findOne({ _id: id, ...notDeletedFilter });

const computeDerived = ({ length, width, quantity, edging }) => ({
  boardM2: calculateBoardM2({ length, width, quantity }),
  edgingLinearMeter: calculateEdgingLinearMeter({
    edging,
    length,
    width,
    quantity,
  }),
});

const buildListFilter = (query) => {
  const filter = { ...notDeletedFilter };

  if (query.productCode) {
    filter.productCode = normalizeCode(query.productCode);
  }

  if (query.component) {
    filter.component = query.component.trim();
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
      { component: new RegExp(term, 'i') },
      { range: new RegExp(term, 'i') },
      { category: new RegExp(term, 'i') },
      { childPartCode: new RegExp(term, 'i') },
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
    FcComponentLine.find(filter).sort(sort).skip(skip).limit(limit).lean(),
    FcComponentLine.countDocuments(filter),
  ]);

  return {
    items: items.map(FcComponentLine.toListObjectFromLean),
    pagination: buildPaginationMeta({ page, limit, total }),
  };
};

const findById = async (id) => {
  const item = await findActiveById(id);
  if (!item) {
    throw new AppError('FC component line not found', HTTP_STATUS.NOT_FOUND);
  }
  return item.toSafeObject();
};

const findByProductCode = async (productCode) => {
  const code = normalizeCode(productCode);
  const items = await FcComponentLine.find({
    productCode: code,
    ...notDeletedFilter,
  })
    .sort({ component: 1 })
    .lean();

  return items.map(FcComponentLine.toListObjectFromLean);
};

const create = async (payload) => {
  const quantity = toOptionalNumber(payload.quantity) ?? 0;
  const length = toOptionalNumber(payload.length) ?? 0;
  const width = toOptionalNumber(payload.width) ?? 0;
  const edging = payload.edging?.trim() || '';
  const derived = computeDerived({ length, width, quantity, edging });

  const item = await FcComponentLine.create({
    range: payload.range?.trim() || '',
    category: payload.category?.trim() || '',
    productCode: normalizeCode(payload.productCode),
    component: payload.component?.trim() || '',
    quantity,
    length,
    width,
    ...derived,
    edging,
    childPartCode: payload.childPartCode?.trim() || '',
    childPartDescription: payload.childPartDescription?.trim() || '',
    type: payload.type?.trim() || '',
    note: payload.note?.trim() || '',
    checkInHw: payload.checkInHw?.trim() || '',
    checkInCatalogue: payload.checkInCatalogue?.trim() || '',
    match: payload.match?.trim() || '',
  });

  return item.toSafeObject();
};

const update = async (id, payload) => {
  const item = await findActiveById(id);
  if (!item) {
    throw new AppError('FC component line not found', HTTP_STATUS.NOT_FOUND);
  }

  if (payload.range !== undefined) item.range = payload.range.trim();
  if (payload.category !== undefined) item.category = payload.category.trim();
  if (payload.productCode !== undefined) {
    item.productCode = normalizeCode(payload.productCode);
  }
  if (payload.component !== undefined) item.component = payload.component.trim();
  if (payload.quantity !== undefined) {
    item.quantity = toOptionalNumber(payload.quantity) ?? 0;
  }
  if (payload.length !== undefined) {
    item.length = toOptionalNumber(payload.length) ?? 0;
  }
  if (payload.width !== undefined) {
    item.width = toOptionalNumber(payload.width) ?? 0;
  }
  if (payload.edging !== undefined) item.edging = payload.edging.trim();
  if (payload.childPartCode !== undefined) {
    item.childPartCode = payload.childPartCode.trim();
  }
  if (payload.childPartDescription !== undefined) {
    item.childPartDescription = payload.childPartDescription.trim();
  }
  if (payload.type !== undefined) item.type = payload.type.trim();
  if (payload.note !== undefined) item.note = payload.note.trim();
  if (payload.checkInHw !== undefined) item.checkInHw = payload.checkInHw.trim();
  if (payload.checkInCatalogue !== undefined) {
    item.checkInCatalogue = payload.checkInCatalogue.trim();
  }
  if (payload.match !== undefined) item.match = payload.match.trim();

  const derived = computeDerived({
    length: item.length,
    width: item.width,
    quantity: item.quantity,
    edging: item.edging,
  });
  item.boardM2 = derived.boardM2;
  item.edgingLinearMeter = derived.edgingLinearMeter;

  await item.save();
  return item.toSafeObject();
};

const upsertLine = async (payload) => {
  const productCode = normalizeCode(payload.productCode);
  const component = payload.component?.trim() || '';

  if (!productCode || !component) {
    throw new AppError(
      'productCode and component are required',
      HTTP_STATUS.BAD_REQUEST
    );
  }

  const quantity = toOptionalNumber(payload.quantity) ?? 0;
  const length = toOptionalNumber(payload.length) ?? 0;
  const width = toOptionalNumber(payload.width) ?? 0;
  const edging = payload.edging?.trim() || '';
  const derived = computeDerived({ length, width, quantity, edging });

  const filter = {
    productCode,
    component,
    length,
    width,
    ...notDeletedFilter,
  };

  const doc = await FcComponentLine.findOneAndUpdate(
    filter,
    {
      $set: {
        range: payload.range?.trim() || '',
        category: payload.category?.trim() || '',
        productCode,
        component,
        quantity,
        length,
        width,
        ...derived,
        edging,
        childPartCode: payload.childPartCode?.trim() || '',
        childPartDescription: payload.childPartDescription?.trim() || '',
        type: payload.type?.trim() || '',
        note: payload.note?.trim() || '',
        checkInHw: payload.checkInHw?.trim() || '',
        checkInCatalogue: payload.checkInCatalogue?.trim() || '',
        match: payload.match?.trim() || '',
        deletedAt: null,
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  return doc.toSafeObject();
};

const softDelete = async (id) => {
  const item = await findActiveById(id);
  if (!item) {
    throw new AppError('FC component line not found', HTTP_STATUS.NOT_FOUND);
  }

  item.deletedAt = new Date();
  await item.save();
  return item.toSafeObject();
};

/**
 * Aggregate FC usage metrics for a product (catalogue rollup inputs).
 */
const aggregateUsageForProduct = async (productCode) => {
  const code = normalizeCode(productCode);
  const lines = await FcComponentLine.find({
    productCode: code,
    ...notDeletedFilter,
  })
    .select('component boardM2 edgingLinearMeter')
    .lean();

  let fcMasoniteUsage = 0;
  let fcBoardUsage = 0;
  let edgingLinearMeterSum = 0;

  lines.forEach((line) => {
    const boardM2 = Number(line.boardM2) || 0;
    const isMasonite =
      String(line.component || '').trim().toLowerCase() === 'masonite';

    if (isMasonite) {
      fcMasoniteUsage += boardM2;
    } else {
      fcBoardUsage += boardM2;
    }
    edgingLinearMeterSum += Number(line.edgingLinearMeter) || 0;
  });

  return {
    fcMasoniteUsage,
    fcBoardUsage,
    edgingLinearMeterSum,
    edgingM: edgingLinearMeterSum / 1000,
    lineCount: lines.length,
  };
};

module.exports = {
  findAll,
  findById,
  findByProductCode,
  create,
  update,
  upsertLine,
  softDelete,
  aggregateUsageForProduct,
  normalizeCode,
  computeDerived,
};
