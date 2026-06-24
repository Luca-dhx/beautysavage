import mongoose from 'mongoose';

const GIFT_CARD_STATUSES = Object.freeze(['active', 'redeemed']);

const giftCardSchema = new mongoose.Schema(
  {
    code: {
      type: String,
      required: true,
      trim: true,
      uppercase: true
    },
    configId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'GiftCardConfig',
      default: null
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    amount: {
      type: Number,
      required: true,
      min: 0
    },
    balance: {
      type: Number,
      required: true,
      min: 0
    },
    reservedAmount: {
      type: Number,
      default: 0,
      min: 0
    },
    reservations: {
      type: [
        {
          paymentIntentId: {
            type: String,
            required: true,
            trim: true
          },
          amount: {
            type: Number,
            required: true,
            min: 0
          },
          createdAt: {
            type: Date,
            default: Date.now
          }
        }
      ],
      default: []
    },
    status: {
      type: String,
      enum: GIFT_CARD_STATUSES,
      default: 'active'
    },
    saleId: {
      type: String,
      trim: true,
      default: ''
    },
    purchasedAt: {
      type: Date,
      default: () => new Date()
    },
    passwordHash: {
      type: String,
      trim: true,
      default: ''
    },
    passwordEncrypted: {
      type: String,
      trim: true,
      default: ''
    }
  },
  {
    collection: 'giftCards',
    timestamps: true
  }
);

giftCardSchema.index({ code: 1 }, { unique: true });
giftCardSchema.index({ userId: 1 });
giftCardSchema.index({ 'reservations.paymentIntentId': 1 }, { sparse: true });

const GiftCard = mongoose.model('GiftCard', giftCardSchema);
export { GIFT_CARD_STATUSES };
export default GiftCard;
