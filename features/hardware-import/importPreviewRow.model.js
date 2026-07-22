const mongoose = require('mongoose');
const {
  ALL_IMPORT_MODULES,
  IMPORT_MODULES,
  ALL_IMPORT_ROW_STATUSES,
  IMPORT_ROW_STATUS,
} = require('../../config/constants');

/**
 * Per-row preview / validation result for an import batch.
 * Kept separate from batch metadata so large workbooks stay under document limits.
 */
const issueSchema = new mongoose.Schema(
  {
    severity: {
      type: String,
      enum: ['ERROR', 'WARNING', 'INFO'],
      required: true,
    },
    code: {
      type: String,
      required: true,
      trim: true,
    },
    message: {
      type: String,
      required: true,
      trim: true,
    },
  },
  { _id: false }
);

const importPreviewRowSchema = new mongoose.Schema(
  {
    batchId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ImportBatch',
      required: true,
      index: true,
    },
    module: {
      type: String,
      enum: ALL_IMPORT_MODULES,
      required: true,
      default: IMPORT_MODULES.HARDWARE,
    },
    excelRowNumber: {
      type: Number,
      required: true,
    },
    stockCode: {
      type: String,
      default: null,
      trim: true,
      uppercase: true,
      index: true,
    },
    description: {
      type: String,
      default: null,
      trim: true,
    },
    status: {
      type: String,
      enum: ALL_IMPORT_ROW_STATUSES,
      required: true,
      default: IMPORT_ROW_STATUS.VALID,
      index: true,
    },
    issues: {
      type: [issueSchema],
      default: [],
    },
    /** Normalized source payload ready for approval snapshot builder. */
    payload: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    existingHardwareId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'HardwareItem',
      default: null,
    },
    isDuplicateInFile: {
      type: Boolean,
      default: false,
    },
    isDuplicateInDatabase: {
      type: Boolean,
      default: false,
    },
    hasPendingApproval: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: false,
    collection: 'importpreviewrows',
  }
);

importPreviewRowSchema.index({ batchId: 1, excelRowNumber: 1 });
importPreviewRowSchema.index({ batchId: 1, status: 1 });

importPreviewRowSchema.statics.toSafeObjectFromLean = function toSafeObjectFromLean(doc) {
  if (!doc) return null;

  const errors = (doc.issues || [])
    .filter((issue) => issue.severity === 'ERROR')
    .map((issue) => issue.message);
  const warnings = (doc.issues || [])
    .filter((issue) => issue.severity === 'WARNING')
    .map((issue) => issue.message);

  return {
    id: doc._id,
    batchId: doc.batchId,
    excelRowNumber: doc.excelRowNumber,
    stockCode: doc.stockCode,
    description: doc.description,
    status: doc.status,
    errors,
    warnings,
    issues: doc.issues || [],
    existingHardwareId: doc.existingHardwareId
      ? doc.existingHardwareId.toString()
      : null,
    isDuplicateInFile: Boolean(doc.isDuplicateInFile),
    isDuplicateInDatabase: Boolean(doc.isDuplicateInDatabase),
    hasPendingApproval: Boolean(doc.hasPendingApproval),
    payload: doc.payload,
  };
};

module.exports = mongoose.model('ImportPreviewRow', importPreviewRowSchema);
