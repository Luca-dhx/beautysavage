import crypto from 'node:crypto';
import mongoose from 'mongoose';

const saleItemSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ['product', 'formation', 'gift-card', 'formation-option', 'service', 'service-option'],
      required: true
    },
    itemId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true
    },
    formationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Formation',
      default: null
    },
    name: {
      type: String,
      trim: true,
      default: ''
    },
    price: {
      type: Number,
      default: 0
    },
    basePrice: {
      type: Number,
      default: 0
    },
    finalPrice: {
      type: Number,
      default: 0
    },
    promotionApplied: {
      type: Boolean,
      default: false
    },
    promotionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Promotion',
      default: null
    },
    consumerWaiverSnapshot: {
      refundDays: { type: Number, default: null },
      retractationDays: { type: Number, default: 14 },
      waiverType: {
        type: String,
        enum: ['legal', 'institut', 'both', null],
        default: null
      },
      waiverAcceptedAt: { type: Date, default: null }
    }
  },
  { _id: false }
);

const saleSchema = new mongoose.Schema(
  {
    saleId: {
      type: String,
      required: true,
      trim: true
    },
    invoiceToken: {
      type: String,
      trim: true,
      default: () => crypto.randomBytes(24).toString('hex')
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    customer: {
      firstName: {
        type: String,
        trim: true,
        default: ''
      },
      lastName: {
        type: String,
        trim: true,
        default: ''
      },
      email: {
        type: String,
        trim: true,
        default: ''
      }
    },
    items: {
      type: [saleItemSchema],
      default: []
    },
    giftCardUsage: {
      type: [
        {
          giftCardId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'GiftCard',
            required: true
          },
          code: {
            type: String,
            trim: true,
            required: true
          },
          amountUsed: {
            type: Number,
            default: 0
          }
        }
      ],
      default: []
    },
    totalAmount: {
      type: Number,
      default: 0
    },
    commissionRate: {
      type: Number,
      default: null
    },
    commissionAmount: {
      type: Number,
      default: null
    },
    itemCount: {
      type: Number,
      default: 0
    },
    accepted_cgv: {
      type: Boolean,
      default: true
    },
    renonciation_text: {
      type: String,
      trim: true,
      default: null
    },
    date_formation: {
      type: Date,
      default: null
    },
    date_session: {
      type: Date,
      default: null
    },
    date_achat: {
      type: Date,
      default: () => new Date()
    },
    consumerWaiverAcceptedText: {
      type: String,
      trim: true
    },
    consumerWaiverAcceptedAt: {
      type: Date
    },
    client_ip: {
      type: String,
      trim: true,
      default: '0.0.0.0'
    },
    createdAt: {
      type: Date,
      default: () => new Date()
    },
    refundRequestId: {
      type: String,
      trim: true,
      default: ''
    },
    refundStatus: {
      type: String,
      trim: true,
      default: ''
    },
    refundAmount: {
      type: Number,
      default: 0
    },
    instituteDecision: {
      flowId: {
        type: String,
        trim: true,
        default: ''
      },
      flowType: {
        type: String,
        trim: true,
        default: ''
      },
      status: {
        type: String,
        trim: true,
        default: ''
      },
      reason: {
        type: String,
        trim: true,
        default: ''
      },
      updatedAt: {
        type: Date,
        default: null
      }
    },
    rescheduleInfo: {
      previousSessionId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'FormationSession',
        default: null
      },
      nextSessionId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'FormationSession',
        default: null
      },
      previousSessionStartAt: {
        type: Date,
        default: null
      },
      nextSessionStartAt: {
        type: Date,
        default: null
      },
      confirmedSessionStartAt: {
        type: Date,
        default: null
      },
      updatedAt: {
        type: Date,
        default: null
      }
    },
    giftCardCompensation: {
      giftCardId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'GiftCard',
        default: null
      },
      code: {
        type: String,
        trim: true,
        default: ''
      },
      amount: {
        type: Number,
        default: 0
      },
      balance: {
        type: Number,
        default: 0
      },
      createdAt: {
        type: Date,
        default: null
      }
    },
    stripeSessionId: {
      type: String,
      trim: true,
      default: null
    },
    stripePaymentIntentId: {
      type: String,
      trim: true,
      default: null
    },
    stripeFee: {
      type: Number,
      default: null
    },
    stripeNet: {
      type: Number,
      default: null
    }
  },
  { collection: 'sales' }
);

saleSchema.index({ saleId: 1 }, { unique: true });
saleSchema.index({ invoiceToken: 1 }, { unique: true, sparse: true });
saleSchema.index({ userId: 1 });
saleSchema.index({ 'items.itemId': 1, 'items.type': 1 });
saleSchema.index({ 'items.formationId': 1, 'items.type': 1 });
saleSchema.index({ stripeSessionId: 1 }, { sparse: true });
// Phase 1B-1: enforce ONE sale per Stripe PaymentIntent at the DB level. This unique
// partial index (string values only) also covers lookups by stripePaymentIntentId,
// so it replaces the previous non-unique sparse index on the same field. Sales with
// stripePaymentIntentId=null (mock / internal gift-card / legacy) are NOT constrained
// and never collide. Built deterministically at boot (app.js) before traffic.
saleSchema.index(
  { stripePaymentIntentId: 1 },
  {
    unique: true,
    name: 'uniq_stripe_payment_intent',
    partialFilterExpression: { stripePaymentIntentId: { $type: 'string' } }
  }
);

const Sale = mongoose.model('Sale', saleSchema);
export default Sale;
