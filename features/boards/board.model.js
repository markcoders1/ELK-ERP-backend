const mongoose = require('mongoose');

const boardSchema = new mongoose.Schema(
  {
    boardCode: {
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
    supplier: {
      type: String,
      trim: true,
      default: '',
    },
    range: {
      type: String,
      trim: true,
      default: '',
    },
    colour: {
      type: String,
      trim: true,
      default: '',
    },
    finish: {
      type: String,
      trim: true,
      default: '',
    },
    boardType: {
      type: String,
      trim: true,
      default: '',
    },
    height: {
      type: Number,
      min: 0,
    },
    width: {
      type: Number,
      min: 0,
    },
    thickness: {
      type: Number,
      min: 0,
    },
    /** NCL Board List_arch "Cost per square meter" — source cost, not Winner retail. */
    costPerM2: {
      type: Number,
      min: 0,
      default: null,
    },
    ekoomsColourId: {
      type: String,
      trim: true,
      default: '',
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

boardSchema.index({ supplier: 1 });
boardSchema.index({ range: 1 });
boardSchema.index({ colour: 1 });
boardSchema.index({ finish: 1 });
boardSchema.index({ boardType: 1 });
boardSchema.index({ deletedAt: 1, boardCode: 1 });

boardSchema.statics.toListObjectFromLean = function toListObjectFromLean(item) {
  return {
    id: item._id,
    boardCode: item.boardCode,
    description: item.description,
    supplier: item.supplier,
    range: item.range,
    colour: item.colour,
    finish: item.finish,
    boardType: item.boardType,
    height: item.height,
    width: item.width,
    thickness: item.thickness,
    costPerM2: item.costPerM2 ?? null,
    ekoomsColourId: item.ekoomColourId || '',
    isActive: item.isActive,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
};

boardSchema.methods.toSafeObject = function toSafeObject() {
  return {
    id: this._id,
    boardCode: this.boardCode,
    description: this.description,
    supplier: this.supplier,
    range: this.range,
    colour: this.colour,
    finish: this.finish,
    boardType: this.boardType,
    height: this.height,
    width: this.width,
    thickness: this.thickness,
    costPerM2: this.costPerM2 ?? null,
    ekoomsColourId: this.ekoomColourId || '',
    isActive: this.isActive,
    deletedAt: this.deletedAt,
    createdBy: this.createdBy,
    updatedBy: this.updatedBy,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt,
  };
};

module.exports = mongoose.model('Board', boardSchema);
