const mongoose = require('mongoose');
const {
  ALL_COMPONENT_VERSION_STATUSES,
  COMPONENT_VERSION_STATUS,
} = require('../../config/constants');

/**
 * Component catalogue header (source fields only).
 * BOM structure lives in ComponentSection + SectionItem (generic sections).
 * Hybrid versioning: live docs are APPROVED; prior copies become SUPERSEDED.
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

const componentSchema = new mongoose.Schema(
  {
    /** Stable identity across SUPERSEDED / APPROVED versions. */
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
    /** Retail selling price (source). Costs / margins are calculated, never stored. */
    retailPrice: {
      type: Number,
      min: 0,
      default: null,
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

/** One live APPROVED row per component code (soft-deleted excluded). */
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
