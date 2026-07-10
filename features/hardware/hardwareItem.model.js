const mongoose = require('mongoose');
const { ALL_PRICING_BASIS } = require('../../config/constants');

const regionalCostsSchema = new mongoose.Schema(
  {
    cpt: {
      type: Number,
      min: 0,
    },
    jhb: {
      type: Number,
      min: 0,
    },
    agreed: {
      type: Number,
      required: true,
      min: 0,
    },
  },
  { _id: false }
);

const hardwareItemSchema = new mongoose.Schema(
  {
    groupCode: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
    },
    stockCode: {
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
    supplierName: {
      type: String,
      trim: true,
      default: '',
    },
    supplierCode: {
      type: String,
      trim: true,
      default: '',
    },
    regionalCosts: {
      type: regionalCostsSchema,
      required: true,
    },
    pricingBasis: {
      type: String,
      enum: ALL_PRICING_BASIS,
      required: true,
    },
    isImport: {
      type: Boolean,
      default: false,
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    deletedAt: {
      type: Date,
      default: null,
      index: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  {
    timestamps: true,
  }
);

hardwareItemSchema.index({ groupCode: 1, isActive: 1 });
hardwareItemSchema.index({ supplierName: 1 });
hardwareItemSchema.index({ pricingBasis: 1 });
hardwareItemSchema.index({ deletedAt: 1, stockCode: 1 });

hardwareItemSchema.statics.toListObjectFromLean = function toListObjectFromLean(item) {
  return {
    id: item._id,
    groupCode: item.groupCode,
    stockCode: item.stockCode,
    description: item.description,
    supplierName: item.supplierName,
    supplierCode: item.supplierCode,
    regionalCosts: item.regionalCosts,
    pricingBasis: item.pricingBasis,
    isImport: item.isImport,
    isActive: item.isActive,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
};

hardwareItemSchema.methods.toSafeObject = function toSafeObject() {
  return {
    id: this._id,
    groupCode: this.groupCode,
    stockCode: this.stockCode,
    description: this.description,
    supplierName: this.supplierName,
    supplierCode: this.supplierCode,
    regionalCosts: this.regionalCosts,
    pricingBasis: this.pricingBasis,
    isImport: this.isImport,
    isActive: this.isActive,
    deletedAt: this.deletedAt,
    createdBy: this.createdBy,
    updatedBy: this.updatedBy,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt,
  };
};

module.exports = mongoose.model('HardwareItem', hardwareItemSchema);
