const mongoose = require('mongoose');

/**
 * Generic BOM section on a Component.
 * sectionType is an open string — seed types BOARD / HARDWARE / FACTORY / VARIANT;
 * future types (DOORS, PANELS, PACKAGING, …) need no schema change.
 */
const componentSectionSchema = new mongoose.Schema(
  {
    componentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Component',
      required: true,
      index: true,
    },
    /** Open string — not a rigid enum in Mongo (plugins validate known types). */
    sectionType: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    sortOrder: {
      type: Number,
      default: 0,
      min: 0,
    },
    /** Extensible section-level metadata (no schema rewrite for future fields). */
    meta: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,
    collection: 'component_sections',
  }
);

componentSectionSchema.index({ componentId: 1, sectionType: 1 });
componentSectionSchema.index({ componentId: 1, sortOrder: 1 });

componentSectionSchema.statics.toSafeObjectFromLean = function toSafeObjectFromLean(doc, extras = {}) {
  return {
    id: doc._id,
    componentId: doc.componentId,
    sectionType: doc.sectionType,
    name: doc.name,
    sortOrder: doc.sortOrder ?? 0,
    meta: doc.meta || {},
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
    ...extras,
  };
};

module.exports = mongoose.model('ComponentSection', componentSectionSchema);
