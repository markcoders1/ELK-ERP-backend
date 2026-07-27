const mongoose = require('mongoose');

/**
 * Generic line item inside a ComponentSection.
 * Type-specific source fields live in `attributes` (Mixed).
 * For HARDWARE sections: store hardwareId + quantity + notes only — never duplicate prices.
 */
const sectionItemSchema = new mongoose.Schema(
  {
    componentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Component',
      required: true,
      index: true,
    },
    sectionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ComponentSection',
      required: true,
      index: true,
    },
    /** Denormalised for aggregation / plugin dispatch without joins. */
    sectionType: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      index: true,
    },
    quantity: {
      type: Number,
      min: 0,
      default: 1,
    },
    notes: {
      type: String,
      trim: true,
      default: '',
    },
    /**
     * Optional unit cost for non-linked cost sources (BOARD / FACTORY / future).
     * HARDWARE items leave this null — cost always resolves from Hardware Master.
     */
    unitCost: {
      type: Number,
      min: 0,
      default: null,
    },
    /** Convenience FK when sectionType === HARDWARE (also mirrored in attributes). */
    hardwareId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'HardwareItem',
      default: null,
      index: true,
    },
    /** Type-specific source payload (board dims, factory op, variant finish, …). */
    attributes: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    sortOrder: {
      type: Number,
      default: 0,
      min: 0,
    },
  },
  {
    timestamps: true,
    collection: 'section_items',
  }
);

sectionItemSchema.index({ sectionId: 1, sortOrder: 1 });
sectionItemSchema.index({ componentId: 1, sectionType: 1 });
sectionItemSchema.index({ hardwareId: 1 }, { sparse: true });

sectionItemSchema.statics.toSafeObjectFromLean = function toSafeObjectFromLean(doc, extras = {}) {
  return {
    id: doc._id,
    componentId: doc.componentId,
    sectionId: doc.sectionId,
    sectionType: doc.sectionType,
    quantity: doc.quantity ?? 1,
    notes: doc.notes || '',
    unitCost: doc.unitCost ?? null,
    hardwareId: doc.hardwareId || null,
    attributes: doc.attributes || {},
    sortOrder: doc.sortOrder ?? 0,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
    ...extras,
  };
};

module.exports = mongoose.model('SectionItem', sectionItemSchema);
