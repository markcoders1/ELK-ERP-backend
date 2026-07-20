const mongoose = require('mongoose');
const {
  ALL_NOTIFICATION_TYPES,
  ALL_ENTITY_TYPES,
  ENTITY_TYPES,
} = require('../../config/constants');

/**
 * Lightweight in-app notifications (no websocket yet).
 */
const notificationSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: ALL_NOTIFICATION_TYPES,
      required: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    message: {
      type: String,
      required: true,
      trim: true,
    },
    entityType: {
      type: String,
      enum: ALL_ENTITY_TYPES,
      default: ENTITY_TYPES.HARDWARE,
    },
    changeRequestId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'HardwareChangeRequest',
      default: null,
    },
    isRead: {
      type: Boolean,
      default: false,
      index: true,
    },
    meta: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
  },
  {
    timestamps: true,
    collection: 'notifications',
  }
);

notificationSchema.index({ userId: 1, createdAt: -1 });
notificationSchema.index({ userId: 1, isRead: 1, createdAt: -1 });

notificationSchema.statics.toSafeObjectFromLean = function toSafeObjectFromLean(doc) {
  if (!doc) return null;

  return {
    id: doc._id,
    userId: doc.userId,
    type: doc.type,
    title: doc.title,
    message: doc.message,
    entityType: doc.entityType,
    changeRequestId: doc.changeRequestId,
    isRead: doc.isRead,
    meta: doc.meta,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
};

module.exports = mongoose.model('Notification', notificationSchema);
