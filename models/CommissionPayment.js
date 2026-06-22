import mongoose from 'mongoose';

const commissionSaleEntrySchema = new mongoose.Schema(
  {
    saleId: { type: mongoose.Schema.Types.ObjectId, ref: 'Sale' },
    formationType: { type: String, default: '' },
    saleDate: { type: Date, default: null },
    commissionType: { type: String, enum: ['fixed', 'percentage'], default: 'fixed' },
    commissionRate: { type: Number, default: null },
    commissionAmount: { type: Number, default: 0 }
  },
  { _id: false }
);

const commissionRefundEntrySchema = new mongoose.Schema(
  {
    refundId: { type: mongoose.Schema.Types.ObjectId, ref: 'RefundRequest' },
    saleId: { type: mongoose.Schema.Types.ObjectId, ref: 'Sale' },
    refundedAt: { type: Date, default: null },
    commissionType: { type: String, enum: ['fixed', 'percentage'], default: 'fixed' },
    commissionRate: { type: Number, default: null },
    commissionAmount: { type: Number, default: 0 }
  },
  { _id: false }
);

const commissionPaymentSchema = new mongoose.Schema(
  {
    month: { type: Number, required: true, min: 0, max: 11 }, // 0=janvier … 11=décembre
    year: { type: Number, required: true },

    periodStart: { type: Date, required: true },
    periodEnd: { type: Date, required: true },

    amount: { type: Number, required: true, default: 0 },

    stripePaymentIntentId: { type: String, default: null, sparse: true },
    status: {
      type: String,
      enum: ['pending', 'succeeded', 'failed'],
      default: 'pending'
    },
    paidAt: { type: Date, default: null },

    stripeInvoiceId: { type: String, default: null, sparse: true },
    stripeInvoicePdfUrl: { type: String, default: null },

    sales: { type: [commissionSaleEntrySchema], default: [] },
    refunds: { type: [commissionRefundEntrySchema], default: [] },

    // Suivi des notifications automatiques (anti-doublon emails)
    availableMailSentAt: { type: Date, default: null },
    lastDayMailSentAt: { type: Date, default: null },
    reminderMailsSentDays: { type: [Number], default: [] },

    createdAt: { type: Date, default: Date.now }
  },
  { collection: 'commissionpayments' }
);

// Anti-doublon : impossible de payer deux fois le même mois/année
commissionPaymentSchema.index({ month: 1, year: 1 }, { unique: true });
commissionPaymentSchema.index({ status: 1 });
commissionPaymentSchema.index({ stripePaymentIntentId: 1 }, { sparse: true });
commissionPaymentSchema.index({ stripeInvoiceId: 1 }, { sparse: true });

const CommissionPayment = mongoose.model('CommissionPayment', commissionPaymentSchema);
export default CommissionPayment;
