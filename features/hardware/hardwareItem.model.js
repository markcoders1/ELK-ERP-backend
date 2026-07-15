const mongoose = require('mongoose');
const { ALL_PRICING_BASIS } = require('../../config/constants');
const {
  calculateHardwarePricing,
  buildPricingSummary,
  DEFAULT_MARKUP,
} = require('./hardwarePricing.service');

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
    // Prefer calculated via hardwarePricing.service; persisted for backward compatibility.
    agreed: {
      type: Number,
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
    mnfMarkup: {
      type: Number,
      min: 0,
      default: DEFAULT_MARKUP,
    },
    frcMarkup: {
      type: Number,
      min: 0,
      default: DEFAULT_MARKUP,
    },
    retailMarkup: {
      type: Number,
      min: 0,
      default: DEFAULT_MARKUP,
    },
    weight: {
      type: Number,
      min: 0,
      default: 0,
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

const buildSourceObject = (item) => ({
  id: item._id,
  groupCode: item.groupCode,
  stockCode: item.stockCode,
  description: item.description,
  supplierName: item.supplierName,
  supplierCode: item.supplierCode,
  regionalCosts: item.regionalCosts,
  pricingBasis: item.pricingBasis,
  mnfMarkup: item.mnfMarkup ?? DEFAULT_MARKUP,
  frcMarkup: item.frcMarkup ?? DEFAULT_MARKUP,
  retailMarkup: item.retailMarkup ?? DEFAULT_MARKUP,
  weight: item.weight ?? 0,
  isImport: item.isImport,
  isActive: item.isActive,
  createdAt: item.createdAt,
  updatedAt: item.updatedAt,
});

const withPricing = (source) => {
  const pricingDetails = calculateHardwarePricing(source);
  const agreed = pricingDetails.agreed;

  return {
    ...source,
    regionalCosts: {
      ...source.regionalCosts,
      agreed: agreed ?? source.regionalCosts?.agreed ?? null,
      var: pricingDetails.var,
    },
    pricingSummary: buildPricingSummary(pricingDetails),
    pricingDetails,
  };
};

hardwareItemSchema.statics.toListObjectFromLean = function toListObjectFromLean(item) {
  return withPricing(buildSourceObject(item));
};

hardwareItemSchema.methods.toSafeObject = function toSafeObject() {
  return withPricing({
    ...buildSourceObject(this),
    deletedAt: this.deletedAt,
    createdBy: this.createdBy,
    updatedBy: this.updatedBy,
  });
};

module.exports = mongoose.model('HardwareItem', hardwareItemSchema);
