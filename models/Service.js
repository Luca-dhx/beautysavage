import mongoose from 'mongoose';

const optionSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  description: { type: String, default: '', trim: true },
  price: { type: Number, required: true, min: 0 },
  isActive: { type: Boolean, default: true }
}, { _id: true });

const promotionSchema = new mongoose.Schema({
  isActive: { type: Boolean, default: false },
  type: { type: String, enum: ['percentage', 'fixed'], default: 'percentage' },
  value: { type: Number, default: 0 },
  startDate: { type: Date, default: null },
  endDate: { type: Date, default: null }
}, { _id: false });

const boostSchema = new mongoose.Schema({
  isActive: { type: Boolean, default: false },
  order: { type: Number, default: 0 }
}, { _id: false });

const serviceSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  slug: { type: String, required: true, trim: true },
  description: { type: String, default: '', trim: true },
  shortDescription: { type: String, default: '', trim: true },
  duration: { type: Number, required: true, min: 1 },
  price: { type: Number, required: true, min: 0 },
  photos: [{ type: String }],
  isActive: { type: Boolean, default: true },
  isBookable: { type: Boolean, default: true },

  paymentType: {
    type: String,
    enum: ['full', 'deposit', 'free'],
    default: 'full'
  },
  depositType: {
    type: String,
    enum: ['percentage', 'fixed'],
    default: 'percentage'
  },
  depositValue: { type: Number, default: 0 },

  capacity: { type: Number, default: 1, min: 1 },
  bufferTime: { type: Number, default: 0, min: 0 },

  promotion: { type: promotionSchema, default: () => ({}) },
  boost: { type: boostSchema, default: () => ({}) },

  cancellationDays: { type: Number, default: 7, min: 0 },
  bookingLeadDays: { type: Number, default: 0, min: 0 },
  allowClientChoosePractitioner: { type: Boolean, default: true },

  options: { type: [optionSchema], default: [] },

  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
}, { collection: 'services' });

serviceSchema.index({ slug: 1 }, { unique: true });
serviceSchema.index({ isActive: 1, 'boost.isActive': 1 });

const Service = mongoose.model('Service', serviceSchema);
export default Service;
