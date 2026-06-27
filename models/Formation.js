import mongoose from 'mongoose';

const TYPE_VALUES = ['presentiel', 'distanciel'];
const STATUS_VALUES = ['draft', 'published', 'disabled'];

const formationSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    trim: true,
    default: ''
  },
  durationDays: {
    type: Number,
    min: 1,
    default: 1
  },
  formalities: {
    type: String,
    trim: true,
    default: ''
  },
  price: {
    type: Number,
    default: 0
  },
  refundDays: {
    type: Number,
    default: 7,
    min: 0
  },
  coverImage: {
    type: String,
    trim: true,
    default: ''
  },
  trailerVideoUrl: {
    type: String,
    trim: true,
    default: ''
  },
  trailerVideoTitle: {
    type: String,
    trim: true,
    default: ''
  },
  whatsappGroupUrl: {
    type: String,
    trim: true,
    default: null
  },
  whatsappGroupTitle: {
    type: String,
    trim: true,
    default: ''
  },
  type: {
    type: String,
    enum: TYPE_VALUES,
    default: 'distanciel'
  },
  // Sprint pré-React A7 — modélisation minimale de l'accès distanciel. `manual`
  // (défaut) = accès livré manuellement (pas de faux « accès immédiat »). `immediate`
  // exige une `accessUrl` configurée, sinon l'achat est bloqué (cas faux).
  accessDeliveryMode: {
    type: String,
    enum: ['manual', 'immediate'],
    default: 'manual'
  },
  accessUrl: {
    type: String,
    trim: true,
    default: ''
  },
  status: {
    type: String,
    enum: STATUS_VALUES,
    default: 'draft'
  },
  active: {
    type: Boolean,
    default: true
  },
  isBoosted: {
    type: Boolean,
    default: false
  },
  boostOrder: {
    type: Number,
    min: 1,
    max: 3,
    default: null
  },
  options: {
    type: [
      {
        name: {
          type: String,
          required: true,
          trim: true
        },
        description: {
          type: String,
          trim: true,
          default: ''
        },
        image: {
          type: String,
          trim: true,
          default: ''
        },
        price: {
          type: Number,
          required: true,
          min: 0
        },
        deadlineDays: {
          type: Number,
          required: true,
          min: 0
        }
      }
    ],
    default: []
  },
  createdAt: {
    type: Date,
    default: () => new Date()
  }
}, {
  collection: 'formations'
});

formationSchema.index({ name: 1 }, { unique: true });

const Formation = mongoose.model('Formation', formationSchema);
export default Formation;
