const HardwareItem = require('./hardwareItem.model');
const AppError = require('../../utils/AppError');
const { HTTP_STATUS, HARDWARE_SORT_FIELDS } = require('../../config/constants');
const { parsePagination, buildPaginationMeta } = require('../../shared/pagination');
const { escapeRegex } = require('../../shared/escapeRegex');
const {
  calculateHardwarePricing,
  DEFAULT_MARKUP,
} = require('./hardwarePricing.service');
const {
  propagateHardwareChange,
  propagateHardwareChanges,
} = require('../cascade/cascade.service');
const hardwareItemRangeService = require('../hardware-item-range/hardwareItemRange.service');

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
const buildRegionalCosts = ({
  cpt,
  jhb,
  pricingBasis,
  mnfMarkup,
  frcMarkup,
  retailMarkup,
  retFromSupplier,
}) => {
  const pricing = calculateHardwarePricing({
    cpt,
    jhb,
    pricingBasis,
    mnfMarkup,
    frcMarkup,
    retailMarkup,
    retFromSupplier,
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
      { groupCode: new RegExp(term, 'i') },
      { supplierName: new RegExp(term, 'i') },
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
  const retFromSupplier = toOptionalNumber(payload.retFromSupplier) ?? null;
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
        retFromSupplier,
      }),
      pricingBasis: payload.pricingBasis,
      mnfMarkup,
      frcMarkup,
      retailMarkup,
      retFromSupplier,
      weight,
      isImport: payload.isImport ?? false,
      isActive: payload.isActive ?? true,
      createdBy: userId,
      updatedBy: userId,
    });

    const safe = item.toSafeObject();
    await propagateHardwareChange(safe.stockCode);
    return safe;
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

  if (payload.retFromSupplier !== undefined) {
    item.retFromSupplier = toOptionalNumber(payload.retFromSupplier) ?? null;
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
    payload.retailMarkup !== undefined ||
    payload.retFromSupplier !== undefined
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
      retFromSupplier: item.retFromSupplier,
    });
  }

  item.updatedBy = userId;
  await item.save();

  const safe = item.toSafeObject();
  await propagateHardwareChange(safe.stockCode);
  return safe;
};

const softDelete = async (id, userId) => {
  const item = await findActiveById(id);

  if (!item) {
    throw new AppError('Hardware item not found', HTTP_STATUS.NOT_FOUND);
  }

  item.deletedAt = new Date();
  item.updatedBy = userId;
  await item.save();

  await hardwareItemRangeService.deactivateByStockCode(item.stockCode);

  return item.toSafeObject();
};

/**
 * Build a HardwareItem document for direct Excel import (live catalogue).
 * Same field rules as create(); adds import provenance metadata.
 */
const buildImportDocument = (payload, { userId, importBatchId, importedAt }) => {
  const stockCode = normalizeStockCode(payload.stockCode);
  const mnfMarkup = toOptionalNumber(payload.mnfMarkup) ?? DEFAULT_MARKUP;
  const frcMarkup = toOptionalNumber(payload.frcMarkup) ?? DEFAULT_MARKUP;
  const retailMarkup = toOptionalNumber(payload.retailMarkup) ?? DEFAULT_MARKUP;
  const retFromSupplier = toOptionalNumber(payload.retFromSupplier) ?? null;
  const weight = toOptionalNumber(payload.weight) ?? 0;
  const cpt = toOptionalNumber(payload.regionalCosts?.cpt);
  const jhb = toOptionalNumber(payload.regionalCosts?.jhb);

  return {
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
      retFromSupplier,
    }),
    pricingBasis: payload.pricingBasis,
    mnfMarkup,
    frcMarkup,
    retailMarkup,
    retFromSupplier,
    weight,
    isImport: payload.isImport ?? true,
    isActive: payload.isActive ?? true,
    importBatchId,
    importedBy: userId,
    importedAt,
    createdBy: userId,
    updatedBy: userId,
  };
};

/**
 * Bulk-insert live hardware rows from Excel import.
 * Uses ordered:false so one duplicate does not abort the chunk.
 */
const createManyFromImport = async (payloads, { userId, importBatchId, importedAt }) => {
  if (!payloads.length) return [];

  const docs = payloads.map((payload) =>
    buildImportDocument(payload, { userId, importBatchId, importedAt })
  );

  let inserted = [];

  try {
    inserted = await HardwareItem.insertMany(docs, { ordered: false });
  } catch (error) {
    // Partial success is expected when a race introduces a duplicate mid-import.
    if (error.writeErrors || error.code === 11000) {
      inserted = error.insertedDocs || [];
    } else {
      throw error;
    }
  }

  const stockCodes = inserted.map((doc) => doc.stockCode).filter(Boolean);
  if (stockCodes.length > 0) {
    await propagateHardwareChanges(stockCodes);
  }

  return inserted;
};

/**
 * Direct Excel re-import: update existing live rows by stockCode (no approval).
 * Returns { updated: HardwareItem[], stockCodes: string[] }.
 */
const updateManyFromImport = async (payloads, { userId, importBatchId, importedAt }) => {
  if (!payloads.length) return { updated: [], stockCodes: [] };

  const updated = [];
  const stockCodes = [];

  // eslint-disable-next-line no-restricted-syntax
  for (const payload of payloads) {
    const stockCode = normalizeStockCode(payload.stockCode);
    // eslint-disable-next-line no-await-in-loop
    const item = await HardwareItem.findOne({ stockCode, ...notDeletedFilter });
    if (!item) continue;

    const doc = buildImportDocument(payload, { userId, importBatchId, importedAt });
    item.groupCode = doc.groupCode;
    item.description = doc.description;
    item.supplierName = doc.supplierName;
    item.supplierCode = doc.supplierCode;
    item.regionalCosts = doc.regionalCosts;
    item.pricingBasis = doc.pricingBasis;
    item.mnfMarkup = doc.mnfMarkup;
    item.frcMarkup = doc.frcMarkup;
    item.retailMarkup = doc.retailMarkup;
    item.retFromSupplier = doc.retFromSupplier;
    item.weight = doc.weight;
    item.isImport = true;
    item.isActive = doc.isActive;
    item.importBatchId = importBatchId;
    item.importedBy = userId;
    item.importedAt = importedAt;
    item.updatedBy = userId;
    // eslint-disable-next-line no-await-in-loop
    await item.save();
    updated.push(item);
    stockCodes.push(stockCode);
  }

  if (stockCodes.length > 0) {
    await propagateHardwareChanges(stockCodes);
  }

  return { updated, stockCodes };
};

module.exports = {
  findAll,
  findById,
  create,
  update,
  softDelete,
  buildImportDocument,
  createManyFromImport,
  updateManyFromImport,
};
