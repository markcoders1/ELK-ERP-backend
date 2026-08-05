const mongoose = require('mongoose');
const {
  ALL_COMPONENT_VERSION_STATUSES,
  COMPONENT_VERSION_STATUS,
} = require('../../config/constants');

/**
 * Component catalogue header (source fields only).
 * BOM structure lives in ComponentSection + SectionItem (generic sections).
 * Hybrid versioning: live docs are APPROVED; prior copies become SUPERSEDED.
 *
 * Optional catalogue_* fields mirror Carcasses & BIC Catalogue identity /
 * workbook source metrics. Calculated rollups still come from the engine.
 */
const dimensionsSchema = new mongoose.Schema(
  {
    length: { type: Number, min: 0, default: null },
    width: { type: Number, min: 0, default: null },
    height: { type: Number, min: 0, default: null },
    unit: { type: String, trim: true, default: 'mm' },
  },
  { _id: false }
);

const catalogueMetricsSchema = new mongoose.Schema(
  {
    hwCost: { type: Number, min: 0, default: null },
    hwMarkup: { type: Number, default: null },
    hwRetail: { type: Number, min: 0, default: null },
    fcMasoniteUsage: { type: Number, min: 0, default: null },
    fcMasoniteCostPerM2: { type: Number, min: 0, default: null },
    fcBoardUsage: { type: Number, min: 0, default: null },
    fcWhiteMelamineCostPerM2: { type: Number, min: 0, default: null },
    edgingUsage: { type: Number, min: 0, default: null },
    edgingCostPerM2: { type: Number, min: 0, default: null },
    fcMarkup: { type: Number, default: null },
    wastage: { type: Number, default: null },
  },
  { _id: false }
);

const componentSchema = new mongoose.Schema(
  {
    lineageId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    version: {
      type: Number,
      required: true,
      default: 1,
      min: 1,
    },
    versionStatus: {
      type: String,
      enum: ALL_COMPONENT_VERSION_STATUSES,
      required: true,
      default: COMPONENT_VERSION_STATUS.APPROVED,
      index: true,
    },
    componentCode: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      index: true,
    },
    description: {
      type: String,
      required: true,
      trim: true,
    },
    category: {
      type: String,
      trim: true,
      default: '',
      index: true,
    },
    finish: {
      type: String,
      trim: true,
      default: '',
      index: true,
    },
    dimensions: {
      type: dimensionsSchema,
      default: () => ({}),
    },
    status: {
      type: String,
      trim: true,
      default: 'Active',
      index: true,
    },
    retailPrice: {
      type: Number,
      min: 0,
      default: null,
    },
    /** Carcasses & BIC Catalogue identity (source). */
    range: { type: String, trim: true, default: '' },
    type: { type: String, trim: true, default: '' },
    modificationClass: { type: String, trim: true, default: '' },
    region: { type: String, trim: true, default: '' },
    categoryDescription: { type: String, trim: true, default: '' },
    colourCode: { type: String, trim: true, default: '' },
    hwIncluded: { type: String, trim: true, default: '' },
    fcIncluded: { type: String, trim: true, default: '' },
    matchStatus: { type: String, trim: true, default: '' },
    /** Workbook source cost metrics (inputs / sheet values — not engine rollups). */
    catalogueMetrics: {
      type: catalogueMetricsSchema,
      default: () => ({}),
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    deletedAt: {
      type: Date,
      default: null,
      index: true,
    },
    importBatchId: {
      type: String,
      default: null,
      trim: true,
      index: true,
    },
    importedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    importedAt: {
      type: Date,
      default: null,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  {
    timestamps: true,
    collection: 'components',
  }
);

componentSchema.index(
  { componentCode: 1 },
  {
    unique: true,
    partialFilterExpression: {
      versionStatus: COMPONENT_VERSION_STATUS.APPROVED,
      deletedAt: null,
    },
  }
);

componentSchema.index({ lineageId: 1, version: -1 });
componentSchema.index({ versionStatus: 1, updatedAt: -1 });
componentSchema.index({ category: 1, finish: 1, versionStatus: 1 });
componentSchema.index({ range: 1, region: 1, versionStatus: 1 });
componentSchema.index({ createdBy: 1, versionStatus: 1 });

const buildSourceObject = (item) => ({
  id: item._id,
  lineageId: item.lineageId,
  version: item.version,
  versionStatus: item.versionStatus,
  componentCode: item.componentCode,
  description: item.description,
  category: item.category || '',
  finish: item.finish || '',
  dimensions: item.dimensions || {},
  status: item.status || 'Active',
  retailPrice: item.retailPrice ?? null,
  range: item.range || '',
  type: item.type || '',
  modificationClass: item.modificationClass || '',
  region: item.region || '',
  categoryDescription: item.categoryDescription || '',
  colourCode: item.colourCode || '',
  hwIncluded: item.hwIncluded || '',
  fcIncluded: item.fcIncluded || '',
  matchStatus: item.matchStatus || '',
  catalogueMetrics: item.catalogueMetrics || {},
  isActive: item.isActive !== false,
  importBatchId: item.importBatchId || null,
  importedBy: item.importedBy || null,
  importedAt: item.importedAt || null,
  createdBy: item.createdBy || null,
  updatedBy: item.updatedBy || null,
  createdAt: item.createdAt,
  updatedAt: item.updatedAt,
});

componentSchema.statics.toListObjectFromLean = function toListObjectFromLean(item, extras = {}) {
  return {
    ...buildSourceObject(item),
    ...extras,
  };
};

componentSchema.methods.toSafeObject = function toSafeObject(extras = {}) {
  return {
    ...buildSourceObject(this),
    deletedAt: this.deletedAt,
    ...extras,
  };
};

componentSchema.statics.buildSourceObject = buildSourceObject;

module.exports = mongoose.model('Component', componentSchema);
