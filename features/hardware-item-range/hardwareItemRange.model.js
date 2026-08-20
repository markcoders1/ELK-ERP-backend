const mongoose = require('mongoose');

/**
 * Hardware Item Range — Excel-faithful projection of Hardware Master.
 * Item Code = STOCK CODE; Manufacturing Price = Master File MNF Price.
 * Persisted as a real collection so HW Components List can FK by itemCode.
 */
const hardwareItemRangeSchema = new mongoose.Schema(
  {
    groupCode: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      index: true,
    },
    itemCode: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      uppercase: true,
    },
    description: {
      type: String,
      required: true,
      trim: true,
    },
    manufacturingPrice: {
      type: Number,
      min: 0,
      default: null,
    },
    hardwareId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'HardwareItem',
      default: null,
      index: true,
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

hardwareItemRangeSchema.index({ isActive: 1, itemCode: 1 });

const toListObject = (item) => ({
  id: item._id,
  groupCode: item.groupCode,
  itemCode: item.itemCode,
  description: item.description,
  manufacturingPrice: item.manufacturingPrice,
  hardwareId: item.hardwareId,
  isActive: item.isActive,
  createdAt: item.createdAt,
  updatedAt: item.updatedAt,
});

hardwareItemRangeSchema.statics.toListObjectFromLean = function toListObjectFromLean(item) {
  return toListObject(item);
};

hardwareItemRangeSchema.methods.toSafeObject = function toSafeObject() {
  return toListObject(this);
};

module.exports = mongoose.model('HardwareItemRange', hardwareItemRangeSchema);
