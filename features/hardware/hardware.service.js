const HardwareItem = require('./hardwareItem.model');
const AppError = require('../../utils/AppError');
const { HTTP_STATUS, HARDWARE_SORT_FIELDS } = require('../../config/constants');
const { parsePagination, buildPaginationMeta } = require('../../shared/pagination');
const { escapeRegex } = require('../../shared/escapeRegex');

const normalizeStockCode = (stockCode) => stockCode.trim().toUpperCase();
const normalizeGroupCode = (groupCode) => groupCode.trim().toUpperCase();

const notDeletedFilter = { deletedAt: null };

const pickRegionalCosts = (regionalCosts) => ({
  cpt: regionalCosts.cpt,
  jhb: regionalCosts.jhb,
  agreed: regionalCosts.agreed,
});

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

  try {
    const item = await HardwareItem.create({
      groupCode: normalizeGroupCode(payload.groupCode),
      stockCode,
      description: payload.description.trim(),
      supplierName: payload.supplierName?.trim() || '',
      supplierCode: payload.supplierCode?.trim() || '',
      regionalCosts: pickRegionalCosts(payload.regionalCosts),
      pricingBasis: payload.pricingBasis,
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

  if (payload.regionalCosts !== undefined) {
    item.regionalCosts = pickRegionalCosts({
      ...item.regionalCosts.toObject(),
      ...payload.regionalCosts,
    });
  }

  if (payload.pricingBasis !== undefined) {
    item.pricingBasis = payload.pricingBasis;
  }

  if (payload.isImport !== undefined) {
    item.isImport = payload.isImport;
  }

  if (payload.isActive !== undefined) {
    item.isActive = payload.isActive;
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
