'use strict';
const mongoose = require('mongoose');

const posItemCatalogSchema = new mongoose.Schema(
  {
    name:            { type: String, required: true, trim: true },
    sku:             { type: String, trim: true, uppercase: true, default: null },
    category: {
      type: String,
      enum: ['Certificate', 'Uniform', 'Stationery', 'Other'],
      default: 'Other',
    },
    price:           { type: Number, required: true, min: 0 },
    taxPercent:      { type: Number, default: 0, min: 0, max: 100 },
    active:          { type: Boolean, default: true },
    requiresStudent: { type: Boolean, default: true },
    createdBy:       { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

posItemCatalogSchema.index({ sku: 1 }, { unique: true, sparse: true });
posItemCatalogSchema.index({ active: 1 });

module.exports = mongoose.model('PosItemCatalog', posItemCatalogSchema);
