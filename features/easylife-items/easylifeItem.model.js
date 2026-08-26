const mongoose = require('mongoose');

/**
 * Winner / Easylife National import SKUs (Doors, Boards, extras, hardware).
 * Source prices = displayed PG1 from the workbook (not ASCII job prices).
 */
const easylifeItemSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, trim: true, uppercase: true, unique: true },
    description: { type: String, trim: true, default: '' },
    unit: { type: String, trim: true, default: 'ea' },
    placement: { type: String, trim: true, default: '' },
    sourceSheet: { type: String, trim: true, default: '' },
    productGroupName: { type: String, trim: true, default: '' },
    searchGroupName: { type: String, trim: true, default: '' },
    /** Default quote price = workbook PG1 */
    pg1Price: { type: Number, min: 0, default: null },
    pgPrices: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

easylifeItemSchema.index({ sourceSheet: 1 });
easylifeItemSchema.index({ productGroupName: 1 });

module.exports = mongoose.model('EasylifeItem', easylifeItemSchema);
