const mongoose = require('mongoose');

/**
 * NCL Edging Colour Range — cost/retail per linear meter.
 */
const edgingColourSchema = new mongoose.Schema(
  {
    colourDescription: { type: String, required: true, trim: true },
    priceGroup: { type: String, trim: true, default: '' },
    costPrice: { type: Number, min: 0, default: null },
    retailPrice: { type: Number, min: 0, default: null },
    isActive: { type: Boolean, default: true },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

edgingColourSchema.index({ colourDescription: 1, deletedAt: 1 });

edgingColourSchema.statics.toListObjectFromLean = function toListObjectFromLean(item) {
  return {
    id: item._id,
    colourDescription: item.colourDescription,
    priceGroup: item.priceGroup || '',
    costPrice: item.costPrice,
    retailPrice: item.retailPrice,
    isActive: item.isActive !== false,
  };
};

module.exports = mongoose.model('EdgingColour', edgingColourSchema);
