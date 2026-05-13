'use strict';
const mongoose = require('mongoose');

const documentCatalogSchema = new mongoose.Schema(
  {
    name:             { type: String, required: true, trim: true },
    code:             { type: String, required: true, trim: true, uppercase: true },
    description:      { type: String, trim: true, default: '' },
    price:            { type: Number, required: true, min: 0 },
    requiresApproval: { type: Boolean, default: true },
    maxCopies:        { type: Number, default: 1, min: 1 },
    active:           { type: Boolean, default: true },
    category: {
      type: String,
      enum: ['Certificate', 'Marks', 'Other'],
      default: 'Certificate',
    },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

documentCatalogSchema.index({ code: 1 }, { unique: true });
documentCatalogSchema.index({ active: 1 });

module.exports = mongoose.model('DocumentCatalog', documentCatalogSchema);
