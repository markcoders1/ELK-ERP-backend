const mongoose = require('mongoose');
const {
  ALL_ENTITY_TYPES,
  ENTITY_TYPES,
  ALL_CHANGE_REQUEST_ACTIONS,
  ALL_CHANGE_REQUEST_STATUSES,
  CHANGE_REQUEST_STATUS,
  ALL_SYNC_STATUSES,
  SYNC_STATUS,
} = require('../../config/constants');

/**
 * Generic change-request document.
 * entityType keeps the approval engine reusable (Hardware today; Boards/Components later).
 * Snapshots are immutable once written — never mutate snapshotBefore / snapshotAfter.
 */
const changeRequestSchema = new mongoose.Schema(
  {
    entityType: {
      type: String,
      enum: ALL_ENTITY_TYPES,
      required: true,
      default: ENTITY_TYPES.HARDWARE,
      index: true,
    },
    hardwareId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'HardwareItem',
      default: null,
      index: true,
    },
    action: {
      type: String,
      enum: ALL_CHANGE_REQUEST_ACTIONS,
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: ALL_CHANGE_REQUEST_STATUSES,
      required: true,
      default: CHANGE_REQUEST_STATUS.PENDING,
      index: true,
    },
    submittedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    rejectedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    submittedAt: {
      type: Date,
      required: true,
      default: Date.now,
      index: true,
    },
    reviewedAt: {
      type: Date,
      default: null,
    },
    rejectionReason: {
      type: String,
      default: null,
      trim: true,
    },
    snapshotBefore: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    snapshotAfter: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
    },
    changedFields: {
      type: [String],
      default: [],
    },
    notificationRead: {
      type: Boolean,
      default: false,
    },
    syncStatus: {
      type: String,
      enum: ALL_SYNC_STATUSES,
      default: SYNC_STATUS.WAITING,
    },
    syncLogs: {
      type: [
        {
          at: { type: Date, default: Date.now },
          target: { type: String, trim: true },
          status: { type: String, trim: true },
          message: { type: String, trim: true },
        },
      ],
      default: [],
    },
    comments: {
      type: String,
      default: '',
      trim: true,
    },
  },
  {
    timestamps: true,
    collection: 'hardwarechangerequests',
  }
);

changeRequestSchema.index({ status: 1, submittedAt: -1 });
changeRequestSchema.index({ entityType: 1, status: 1, submittedAt: -1 });
changeRequestSchema.index({ 'snapshotAfter.stockCode': 1, status: 1 });

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

changeRequestSchema.statics.toSafeObjectFromLean = function toSafeObjectFromLean(doc) {
  if (!doc) return null;

  return {
    id: doc._id,
    entityType: doc.entityType,
    hardwareId: doc.hardwareId,
    action: doc.action,
    status: doc.status,
    submittedBy: populateUser(doc.submittedBy),
    approvedBy: populateUser(doc.approvedBy),
    rejectedBy: populateUser(doc.rejectedBy),
    submittedAt: doc.submittedAt,
    reviewedAt: doc.reviewedAt,
    rejectionReason: doc.rejectionReason,
    snapshotBefore: doc.snapshotBefore,
    snapshotAfter: doc.snapshotAfter,
    changedFields: doc.changedFields || [],
    notificationRead: doc.notificationRead,
    syncStatus: doc.syncStatus,
    syncLogs: doc.syncLogs || [],
    comments: doc.comments || '',
    stockCode: doc.snapshotAfter?.stockCode || doc.snapshotBefore?.stockCode || null,
    description: doc.snapshotAfter?.description || doc.snapshotBefore?.description || null,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
};

changeRequestSchema.methods.toSafeObject = function toSafeObject() {
  return this.constructor.toSafeObjectFromLean(this.toObject({ virtuals: false }));
};

module.exports = mongoose.model('HardwareChangeRequest', changeRequestSchema);
