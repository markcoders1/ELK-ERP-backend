const mongoose = require('mongoose');

/**
 * FC Components List line — factory BOM by product (board / edging dimensions).
 * boardM2 and edgingLinearMeter are calculated (Excel-faithful), not client-trusted.
 */
const fcComponentLineSchema = new mongoose.Schema(
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
    component: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    quantity: {
      type: Number,
      min: 0,
      default: 0,
    },
    length: {
      type: Number,
      min: 0,
      default: 0,
    },
    width: {
      type: Number,
      min: 0,
      default: 0,
    },
    /** Calculated: length * width / 1e6 * quantity */
    boardM2: {
      type: Number,
      min: 0,
      default: 0,
    },
    edging: {
      type: String,
      trim: true,
      default: '',
    },
    /** Calculated from Excel edging IF chain */
    edgingLinearMeter: {
      type: Number,
      min: 0,
      default: 0,
    },
    childPartCode: {
      type: String,
      trim: true,
      default: '',
    },
    childPartDescription: {
      type: String,
      trim: true,
      default: '',
    },
    type: {
      type: String,
      trim: true,
      default: '',
    },
    note: {
      type: String,
      trim: true,
      default: '',
    },
    checkInHw: {
      type: String,
      trim: true,
      default: '',
    },
    checkInCatalogue: {
      type: String,
      trim: true,
      default: '',
    },
    match: {
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

fcComponentLineSchema.index({ deletedAt: 1, productCode: 1 });
fcComponentLineSchema.index({ deletedAt: 1, component: 1 });

const toSafeObject = (item) => ({
  id: item._id,
  range: item.range,
  category: item.category,
  productCode: item.productCode,
  component: item.component,
  quantity: item.quantity,
  length: item.length,
  width: item.width,
  boardM2: item.boardM2,
  edging: item.edging,
  edgingLinearMeter: item.edgingLinearMeter,
  childPartCode: item.childPartCode,
  childPartDescription: item.childPartDescription,
  type: item.type,
  note: item.note,
  checkInHw: item.checkInHw,
  checkInCatalogue: item.checkInCatalogue,
  match: item.match,
  deletedAt: item.deletedAt,
  createdAt: item.createdAt,
  updatedAt: item.updatedAt,
});

fcComponentLineSchema.statics.toListObjectFromLean = function toListObjectFromLean(item) {
  return toSafeObject(item);
};

fcComponentLineSchema.methods.toSafeObject = function toSafeObjectMethod() {
  return toSafeObject(this);
};

module.exports = mongoose.model('FcComponentLine', fcComponentLineSchema);
