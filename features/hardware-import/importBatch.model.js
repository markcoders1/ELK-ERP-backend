const mongoose = require('mongoose');
const {
  ALL_IMPORT_MODULES,
  IMPORT_MODULES,
  ALL_IMPORT_BATCH_STATUSES,
  IMPORT_BATCH_STATUS,
  ALL_IMPORT_DUPLICATE_STRATEGIES,
  IMPORT_DUPLICATE_STRATEGY,
} = require('../../config/constants');

/**
 * Generic import batch metadata.
 * module keeps the pipeline reusable (Hardware today; Boards/Products/BOMs later).
 */
const importBatchSchema = new mongoose.Schema(
  {
    module: {
      type: String,
      enum: ALL_IMPORT_MODULES,
      required: true,
      default: IMPORT_MODULES.HARDWARE,
      index: true,
    },
    batchName: {
      type: String,
      required: true,
      trim: true,
    },
    /** Human-readable batch id, e.g. IMP-20260718-001 */
    batchCode: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    },
    filename: {
      type: String,
      required: true,
      trim: true,
    },
    applyMode: {
      type: String,
      default: 'DIRECT',
      trim: true,
    },
    sheetName: {
      type: String,
      default: null,
      trim: true,
    },
    uploadedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    uploadedAt: {
      type: Date,
      required: true,
      default: Date.now,
      index: true,
    },
    status: {
      type: String,
      enum: ALL_IMPORT_BATCH_STATUSES,
      required: true,
      default: IMPORT_BATCH_STATUS.PREVIEW,
      index: true,
    },
    duplicateStrategy: {
      type: String,
      enum: ALL_IMPORT_DUPLICATE_STRATEGIES,
      default: IMPORT_DUPLICATE_STRATEGY.SKIP_EXISTING,
    },
    stats: {
      rowsFound: { type: Number, default: 0 },
      valid: { type: Number, default: 0 },
      warnings: { type: Number, default: 0 },
      errors: { type: Number, default: 0 },
      duplicates: { type: Number, default: 0 },
      rowsReady: { type: Number, default: 0 },
      rowsSkipped: { type: Number, default: 0 },
      rowsImported: { type: Number, default: 0 },
    },
    changeRequestIds: {
      type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'HardwareChangeRequest' }],
      default: [],
    },
    errorMessage: {
      type: String,
      default: null,
      trim: true,
    },
    completedAt: {
      type: Date,
      default: null,
    },
    cancelledAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
    collection: 'importbatches',
  }
);

importBatchSchema.index({ module: 1, uploadedAt: -1 });
importBatchSchema.index({ status: 1, uploadedAt: -1 });

const populateUser = (doc) => {
  if (!doc) return null;
  if (typeof doc !== 'object' || doc.name == null) {
    return { id: String(doc._id || doc) };
  }
  return {
    id: doc._id?.toString?.() || doc._id || doc.id,
    name: doc.name,
    email: doc.email,
    role: doc.role,
  };
};

importBatchSchema.statics.toSafeObjectFromLean = function toSafeObjectFromLean(doc) {
  if (!doc) return null;

  return {
    id: doc._id,
    module: doc.module,
    batchName: doc.batchName,
    batchCode: doc.batchCode,
    filename: doc.filename,
    sheetName: doc.sheetName,
    applyMode: doc.applyMode || 'DIRECT',
    uploadedBy: populateUser(doc.uploadedBy),
    uploadedAt: doc.uploadedAt,
    status: doc.status,
    duplicateStrategy: doc.duplicateStrategy,
    stats: {
      rowsFound: doc.stats?.rowsFound || 0,
      valid: doc.stats?.valid || 0,
      warnings: doc.stats?.warnings || 0,
      errors: doc.stats?.errors || 0,
      duplicates: doc.stats?.duplicates || 0,
      rowsReady: doc.stats?.rowsReady || 0,
      rowsSkipped: doc.stats?.rowsSkipped || 0,
      rowsImported: doc.stats?.rowsImported || 0,
    },
    changeRequestIds: (doc.changeRequestIds || []).map((id) => id?.toString?.() || id),
    errorMessage: doc.errorMessage,
    completedAt: doc.completedAt,
    cancelledAt: doc.cancelledAt,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
};

module.exports = mongoose.model('ImportBatch', importBatchSchema);
