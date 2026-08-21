const HardwareItemRange = require('./hardwareItemRange.model');
const AppError = require('../../utils/AppError');
const { HTTP_STATUS } = require('../../config/constants');
const { parsePagination, buildPaginationMeta } = require('../../shared/pagination');
const { escapeRegex } = require('../../shared/escapeRegex');
const {
  calculateHardwarePricing,
} = require('../hardware/hardwarePricing.service');

const normalizeItemCode = (code) => String(code || '').trim().toUpperCase();

const SORT_FIELDS = ['itemCode', 'groupCode', 'description', 'manufacturingPrice', 'createdAt', 'updatedAt'];

/**
 * Upsert HIR from a Hardware Master safe/lean object.
 * manufacturingPrice = pricing.mnfPrice (Master File MNF Price).
 */
const upsertFromHardware = async (hardwareSafeOrLean) => {
  if (!hardwareSafeOrLean) {
    throw new AppError('Hardware source is required for HIR upsert', HTTP_STATUS.BAD_REQUEST);
  }

  const itemCode = normalizeItemCode(
    hardwareSafeOrLean.stockCode || hardwareSafeOrLean.itemCode
  );

  if (!itemCode) {
    throw new AppError('Stock / item code is required for HIR upsert', HTTP_STATUS.BAD_REQUEST);
  }

  const pricing =
    hardwareSafeOrLean.pricingDetails ||
    calculateHardwarePricing(hardwareSafeOrLean);

  const hardwareId =
    hardwareSafeOrLean.id ||
    hardwareSafeOrLean._id ||
    hardwareSafeOrLean.hardwareId ||
    null;

  const doc = await HardwareItemRange.findOneAndUpdate(
    { itemCode },
    {
      $set: {
        groupCode: String(hardwareSafeOrLean.groupCode || '').trim().toUpperCase(),
        itemCode,
        description: String(hardwareSafeOrLean.description || '').trim() || itemCode,
        manufacturingPrice:
          pricing.mnfPrice != null ? Number(pricing.mnfPrice) : null,
        hardwareId,
        isActive: hardwareSafeOrLean.isActive !== false,
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  return doc.toSafeObject();
};

/**
 * Upsert HIR manufacturing price from NCL Hardware Item Range (Excel displayed MNF).
 * Used when Master SKU is not yet imported but NCL already has Manufacturing Price.
 */
const upsertManufacturingPrice = async ({
  itemCode,
  description,
  groupCode,
  manufacturingPrice,
  hardwareId = null,
}) => {
  const code = normalizeItemCode(itemCode);
  if (!code) {
    throw new AppError('itemCode is required for HIR upsert', HTTP_STATUS.BAD_REQUEST);
  }

  const price =
    manufacturingPrice === '' ||
    manufacturingPrice === null ||
    manufacturingPrice === undefined
      ? null
      : Number(manufacturingPrice);

  const doc = await HardwareItemRange.findOneAndUpdate(
    { itemCode: code },
    {
      $set: {
        itemCode: code,
        groupCode: String(groupCode || '').trim().toUpperCase(),
        description: String(description || '').trim() || code,
        manufacturingPrice: Number.isFinite(price) ? price : null,
        ...(hardwareId ? { hardwareId } : {}),
        isActive: true,
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  return doc.toSafeObject();
};

const buildListFilter = (query) => {
  const filter = {};

  if (query.isActive !== undefined) {
    filter.isActive = query.isActive === 'true';
  }

  if (query.groupCode) {
    filter.groupCode = String(query.groupCode).trim().toUpperCase();
  }

  if (query.search) {
    const term = escapeRegex(query.search.trim());
    filter.$or = [
      { itemCode: new RegExp(term, 'i') },
      { description: new RegExp(term, 'i') },
      { groupCode: new RegExp(term, 'i') },
    ];
  }

  return filter;
};

const buildSort = (query) => {
  const sortBy = SORT_FIELDS.includes(query.sortBy) ? query.sortBy : 'itemCode';
  const sortOrder = query.sortOrder === 'desc' ? -1 : 1;
  return { [sortBy]: sortOrder };
};

const findAll = async (query) => {
  const { page, limit, skip } = parsePagination(query);
  const filter = buildListFilter(query);
  const sort = buildSort(query);

  const [items, total] = await Promise.all([
    HardwareItemRange.find(filter).sort(sort).skip(skip).limit(limit).lean(),
    HardwareItemRange.countDocuments(filter),
  ]);

  return {
    items: items.map(HardwareItemRange.toListObjectFromLean),
    pagination: buildPaginationMeta({ page, limit, total }),
  };
};

const findByItemCode = async (itemCode) => {
  const code = normalizeItemCode(itemCode);
  const item = await HardwareItemRange.findOne({ itemCode: code }).lean();

  if (!item) {
    throw new AppError('Hardware item range not found', HTTP_STATUS.NOT_FOUND);
  }

  return HardwareItemRange.toListObjectFromLean(item);
};

const deactivateByStockCode = async (stockCode) => {
  const itemCode = normalizeItemCode(stockCode);
  const updated = await HardwareItemRange.findOneAndUpdate(
    { itemCode },
    { $set: { isActive: false } },
    { new: true }
  );

  return updated ? updated.toSafeObject() : null;
};

module.exports = {
  upsertFromHardware,
  upsertManufacturingPrice,
  findAll,
  findByItemCode,
  deactivateByStockCode,
  normalizeItemCode,
};
