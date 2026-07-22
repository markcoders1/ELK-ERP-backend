const mongoose = require('mongoose');
const {
  ALL_ENTITY_TYPES,
  ENTITY_TYPES,
  ALL_CHANGE_REQUEST_ACTIONS,
  ALL_USER_AUDIT_ACTIONS,
  ALL_IMPORT_AUDIT_ACTIONS,
  ALL_AUDIT_DECISIONS,
} = require('../../config/constants');

const ALL_AUDIT_ACTIONS = [
  ...ALL_CHANGE_REQUEST_ACTIONS,
  ...ALL_USER_AUDIT_ACTIONS,
  ...ALL_IMPORT_AUDIT_ACTIONS,
];

/**
 * Immutable audit entries.
 * Hardware approvals: decision log with changeRequestId / stockCode.
 * User management: actor + target + before/after snapshots.
 * Never update or delete after insert.
 */
const auditLogSchema = new mongoose.Schema(
  {
    entityType: {
      type: String,
      enum: ALL_ENTITY_TYPES,
      required: true,
      default: ENTITY_TYPES.HARDWARE,
      index: true,
    },
    changeRequestId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'HardwareChangeRequest',
      default: null,
      index: true,
    },
    hardwareId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'HardwareItem',
      default: null,
      index: true,
    },
    targetUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true,
    },
    stockCode: {
      type: String,
      default: null,
      trim: true,
      uppercase: true,
      index: true,
    },
    action: {
      type: String,
      enum: ALL_AUDIT_ACTIONS,
      required: true,
    },
    decision: {
      type: String,
      default: null,
      index: true,
      validate: {
        validator(value) {
          return value == null || ALL_AUDIT_DECISIONS.includes(value);
        },
        message: 'Invalid audit decision',
      },
    },
    changedFields: {
      type: [String],
      default: [],
    },
    submittedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    decidedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    reason: {
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
      default: null,
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
    collection: 'audits',
  }
);

auditLogSchema.index({ createdAt: -1 });
auditLogSchema.index({ stockCode: 1, createdAt: -1 });
auditLogSchema.index({ entityType: 1, createdAt: -1 });
auditLogSchema.index({ targetUserId: 1, createdAt: -1 });

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

auditLogSchema.statics.toSafeObjectFromLean = function toSafeObjectFromLean(doc) {
  if (!doc) return null;

  return {
    id: doc._id,
    entityType: doc.entityType,
    changeRequestId: doc.changeRequestId,
    hardwareId: doc.hardwareId,
    targetUserId: doc.targetUserId
      ? doc.targetUserId._id?.toString?.() || doc.targetUserId.toString?.() || doc.targetUserId
      : null,
    stockCode: doc.stockCode,
    action: doc.action,
    decision: doc.decision,
    changedFields: doc.changedFields || [],
    submittedBy: populateUser(doc.submittedBy),
    decidedBy: populateUser(doc.decidedBy),
    approvedBy: populateUser(doc.decidedBy),
    reason: doc.reason,
    snapshotBefore: doc.snapshotBefore,
    snapshotAfter: doc.snapshotAfter,
    createdAt: doc.createdAt,
  };
};

module.exports = mongoose.model('AuditLog', auditLogSchema);
