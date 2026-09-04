const mongoose = require('mongoose');
const {
  WINNER_IMPORT_STATUS,
  ALL_WINNER_IMPORT_STATUSES,
} = require('../../config/constants');

/**
 * Persistent Winner ASCII import (from desktop connector).
 * Idempotency: connectorId + sha256.
 * Original file on disk; full quote JSON for viewing / PDF export.
 */
const winnerImportSchema = new mongoose.Schema(
  {
    connectorId: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    connectorRef: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'WinnerConnector',
      required: true,
    },
    fileName: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    fileExtension: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },
    fileSize: {
      type: Number,
      required: true,
      min: 1,
    },
    sha256: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      index: true,
    },
    modifiedAt: {
      type: Date,
      default: null,
    },
    connectorVersion: {
      type: String,
      trim: true,
      default: '',
    },
    /** Relative path under server/uploads/ */
    storedFilePath: {
      type: String,
      trim: true,
      default: null,
    },
    /** Denormalized for list/search */
    jobName: {
      type: String,
      trim: true,
      default: '',
      index: true,
    },
    city: {
      type: String,
      trim: true,
      default: '',
    },
    status: {
      type: String,
      enum: ALL_WINNER_IMPORT_STATUSES,
      default: WINNER_IMPORT_STATUS.ACCEPTED,
      index: true,
    },
    /** Compact list fields */
    quoteSummary: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    /**
     * Full ascii-quote result: { header, summary, lines }
     * Used by web UI + client-side PDF export.
     */
    quote: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
      select: false,
    },
    errorMessage: {
      type: String,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

winnerImportSchema.index({ connectorId: 1, sha256: 1 }, { unique: true });
winnerImportSchema.index({ createdAt: -1 });

module.exports = mongoose.model('WinnerImport', winnerImportSchema);
