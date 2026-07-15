const HardwareItem = require('./hardwareItem.model');
const AppError = require('../../utils/AppError');
const { HTTP_STATUS, HARDWARE_SORT_FIELDS } = require('../../config/constants');
const { parsePagination, buildPaginationMeta } = require('../../shared/pagination');
const { escapeRegex } = require('../../shared/escapeRegex');
const {
  calculateHardwarePricing,
  DEFAULT_MARKUP,
} = require('./hardwarePricing.service');

const normalizeStockCode = (stockCode) => stockCode.trim().toUpperCase();
const normalizeGroupCode = (groupCode) => groupCode.trim().toUpperCase();

const notDeletedFilter = { deletedAt: null };

const toOptionalNumber = (value) => {
  if (value === '' || value === null || value === undefined) return undefined;
  const number = Number(value);
  return Number.isNaN(number) ? undefined : number;
};

/**
 * Builds persisted regional costs.
 * Agreed is always derived from the pricing calculator (not trusted from client).
 */
const buildRegionalCosts = ({ cpt, jhb, pricingBasis, mnfMarkup, frcMarkup, retailMarkup }) => {
  const pricing = calculateHardwarePricing({
    cpt,
    jhb,
    pricingBasis,
    mnfMarkup,
    frcMarkup,
    retailMarkup,
  });

  return {
    cpt: cpt ?? null,
    jhb: jhb ?? null,
    agreed: pricing.agreed ?? null,
  };
};

const findActiveById = (id) => HardwareItem.findOne({ _id: id, ...notDeletedFilter });

const buildListFilter = (query) => {
  const filter = { ...notDeletedFilter };

  if (query.groupCode) {
    filter.groupCode = normalizeGroupCode(query.groupCode);
  }

  if (query.supplierName) {
    filter.supplierName = query.supplierName.trim();
  }

  if (query.pricingBasis) {
    filter.pricingBasis = query.pricingBasis;
  }

  if (query.isActive !== undefined) {
    filter.isActive = query.isActive === 'true';
  }

  if (query.isImport !== undefined) {
    filter.isImport = query.isImport === 'true';
  }

  if (query.search) {
    const term = escapeRegex(query.search.trim());
    filter.$or = [
      { stockCode: new RegExp(term, 'i') },
      { description: new RegExp(term, 'i') },
    ];
  }

  return filter;
};

const buildSort = (query) => {
  const sortBy = HARDWARE_SORT_FIELDS.includes(query.sortBy) ? query.sortBy : 'stockCode';
  const sortOrder = query.sortOrder === 'desc' ? -1 : 1;

  return { [sortBy]: sortOrder };
};

const findAll = async (query) => {
  const { page, limit, skip } = parsePagination(query);
  const filter = buildListFilter(query);
  const sort = buildSort(query);

  const [items, total] = await Promise.all([
    HardwareItem.find(filter).sort(sort).skip(skip).limit(limit).lean(),
    HardwareItem.countDocuments(filter),
  ]);

  return {
    items: items.map(HardwareItem.toListObjectFromLean),
    pagination: buildPaginationMeta({ page, limit, total }),
  };
};

const findById = async (id) => {
  const item = await findActiveById(id);

  if (!item) {
    throw new AppError('Hardware item not found', HTTP_STATUS.NOT_FOUND);
  }

  return item.toSafeObject();
};

const create = async (payload, userId) => {
  const stockCode = normalizeStockCode(payload.stockCode);

  const existing = await HardwareItem.findOne({ stockCode }).lean();

  if (existing) {
    throw new AppError('Stock code already exists', HTTP_STATUS.CONFLICT);
  }

  const mnfMarkup = toOptionalNumber(payload.mnfMarkup) ?? DEFAULT_MARKUP;
  const frcMarkup = toOptionalNumber(payload.frcMarkup) ?? DEFAULT_MARKUP;
  const retailMarkup = toOptionalNumber(payload.retailMarkup) ?? DEFAULT_MARKUP;
  const weight = toOptionalNumber(payload.weight) ?? 0;
  const cpt = toOptionalNumber(payload.regionalCosts?.cpt);
  const jhb = toOptionalNumber(payload.regionalCosts?.jhb);

  try {
    const item = await HardwareItem.create({
      groupCode: normalizeGroupCode(payload.groupCode),
      stockCode,
      description: payload.description.trim(),
      supplierName: payload.supplierName?.trim() || '',
      supplierCode: payload.supplierCode?.trim() || '',
      regionalCosts: buildRegionalCosts({
        cpt,
        jhb,
        pricingBasis: payload.pricingBasis,
        mnfMarkup,
        frcMarkup,
        retailMarkup,
      }),
      pricingBasis: payload.pricingBasis,
      mnfMarkup,
      frcMarkup,
      retailMarkup,
      weight,
      isImport: payload.isImport ?? false,
      isActive: payload.isActive ?? true,
      createdBy: userId,
      updatedBy: userId,
    });

    return item.toSafeObject();
  } catch (error) {
    if (error.code === 11000) {
      throw new AppError('Stock code already exists', HTTP_STATUS.CONFLICT);
    }
    throw error;
  }
};

const update = async (id, payload, userId) => {
  const item = await findActiveById(id);

  if (!item) {
    throw new AppError('Hardware item not found', HTTP_STATUS.NOT_FOUND);
  }

  if (payload.groupCode !== undefined) {
    item.groupCode = normalizeGroupCode(payload.groupCode);
  }

  if (payload.description !== undefined) {
    item.description = payload.description.trim();
  }

  if (payload.supplierName !== undefined) {
    item.supplierName = payload.supplierName.trim();
  }

  if (payload.supplierCode !== undefined) {
    item.supplierCode = payload.supplierCode.trim();
  }

  if (payload.pricingBasis !== undefined) {
    item.pricingBasis = payload.pricingBasis;
  }

  if (payload.mnfMarkup !== undefined) {
    item.mnfMarkup = toOptionalNumber(payload.mnfMarkup) ?? DEFAULT_MARKUP;
  }

  if (payload.frcMarkup !== undefined) {
    item.frcMarkup = toOptionalNumber(payload.frcMarkup) ?? DEFAULT_MARKUP;
  }

  if (payload.retailMarkup !== undefined) {
    item.retailMarkup = toOptionalNumber(payload.retailMarkup) ?? DEFAULT_MARKUP;
  }

  if (payload.weight !== undefined) {
    item.weight = toOptionalNumber(payload.weight) ?? 0;
  }

  if (payload.isImport !== undefined) {
    item.isImport = payload.isImport;
  }

  if (payload.isActive !== undefined) {
    item.isActive = payload.isActive;
  }

  const existingRegional = item.regionalCosts?.toObject
    ? item.regionalCosts.toObject()
    : item.regionalCosts || {};

  if (
    payload.regionalCosts !== undefined ||
    payload.pricingBasis !== undefined ||
    payload.mnfMarkup !== undefined ||
    payload.frcMarkup !== undefined ||
    payload.retailMarkup !== undefined
  ) {
    const nextCpt =
      payload.regionalCosts && Object.prototype.hasOwnProperty.call(payload.regionalCosts, 'cpt')
        ? toOptionalNumber(payload.regionalCosts.cpt)
        : existingRegional.cpt;
    const nextJhb =
      payload.regionalCosts && Object.prototype.hasOwnProperty.call(payload.regionalCosts, 'jhb')
        ? toOptionalNumber(payload.regionalCosts.jhb)
        : existingRegional.jhb;

    item.regionalCosts = buildRegionalCosts({
      cpt: nextCpt,
      jhb: nextJhb,
      pricingBasis: item.pricingBasis,
      mnfMarkup: item.mnfMarkup,
      frcMarkup: item.frcMarkup,
      retailMarkup: item.retailMarkup,
    });
  }

  item.updatedBy = userId;
  await item.save();

  return item.toSafeObject();
};

const softDelete = async (id, userId) => {
  const item = await findActiveById(id);

  if (!item) {
    throw new AppError('Hardware item not found', HTTP_STATUS.NOT_FOUND);
  }

  item.deletedAt = new Date();
  item.updatedBy = userId;
  await item.save();

  return item.toSafeObject();
};

module.exports = {
  findAll,
  findById,
  create,
  update,
  softDelete,
};
