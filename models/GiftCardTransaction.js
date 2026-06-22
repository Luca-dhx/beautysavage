import mongoose from 'mongoose';

const giftCardTransactionItemSchema = new mongoose.Schema(
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
    price: {
      type: Number,
      default: 0
    }
  },
  { _id: false }
);

const giftCardTransactionSchema = new mongoose.Schema(
  {
    giftCardId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'GiftCard',
      required: true
    },
    transactionType: {
      type: String,
      enum: ['redeem', 'manual_debit', 'credit'],
      default: 'redeem'
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    actorUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    },
    actorRole: {
      type: String,
      enum: ['client', 'admin', 'dev', 'system'],
      default: 'client'
    },
    amount: {
      type: Number,
      required: true,
      min: 0
    },
    balanceBefore: {
      type: Number,
      required: true,
      min: 0
    },
    balanceAfter: {
      type: Number,
      required: true,
      min: 0
    },
    saleId: {
      type: String,
      trim: true,
      default: ''
    },
    note: {
      type: String,
      trim: true,
      default: ''
    },
    items: {
      type: [giftCardTransactionItemSchema],
      default: []
    }
  },
  {
    collection: 'giftCardTransactions',
    timestamps: true
  }
);

giftCardTransactionSchema.index({ giftCardId: 1 });
giftCardTransactionSchema.index({ userId: 1 });

const GiftCardTransaction = mongoose.model('GiftCardTransaction', giftCardTransactionSchema);
export default GiftCardTransaction;
