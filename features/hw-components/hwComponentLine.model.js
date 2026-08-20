const mongoose = require('mongoose');

/**
 * HW Components List line — product ↔ hardware stock code quantities.
 * COST PRICE / TOTAL COST are cascade-maintained from Hardware Item Range MNF.
 */
const hwComponentLineSchema = new mongoose.Schema(
  {
    range: {
      type: String,
      trim: true,
      default: '',
      index: true,
    },
    category: {
      type: String,
      trim: true,
      default: '',
      index: true,
    },
    productCode: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      index: true,
    },
    /** Stock code FK → Hardware Item Range.itemCode / Hardware.stockCode */
    hardwareItem: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      index: true,
    },
    quantity: {
      type: Number,
      min: 0,
      default: 0,
    },
    itemCount: {
      type: Number,
      min: 0,
      default: null,
    },
    costPrice: {
      type: Number,
      min: 0,
      default: null,
    },
    totalCost: {
      type: Number,
      min: 0,
      default: null,
    },
    checkInFc: {
      type: String,
      trim: true,
      default: '',
    },
    checkInCatalogue: {
      type: String,
      trim: true,
      default: '',
    },
    matchInBoth: {
      type: String,
      trim: true,
      default: '',
    },
    deletedAt: {
      type: Date,
      default: null,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

hwComponentLineSchema.index({ deletedAt: 1, productCode: 1 });
hwComponentLineSchema.index({ deletedAt: 1, hardwareItem: 1 });

const toSafeObject = (item) => ({
  id: item._id,
  range: item.range,
  category: item.category,
  productCode: item.productCode,
  hardwareItem: item.hardwareItem,
  quantity: item.quantity,
  itemCount: item.itemCount,
  costPrice: item.costPrice,
  totalCost: item.totalCost,
  checkInFc: item.checkInFc,
  checkInCatalogue: item.checkInCatalogue,
  matchInBoth: item.matchInBoth,
  deletedAt: item.deletedAt,
  createdAt: item.createdAt,
  updatedAt: item.updatedAt,
});

hwComponentLineSchema.statics.toListObjectFromLean = function toListObjectFromLean(item) {
  return toSafeObject(item);
};

hwComponentLineSchema.methods.toSafeObject = function toSafeObjectMethod() {
  return toSafeObject(this);
};

module.exports = mongoose.model('HwComponentLine', hwComponentLineSchema);
