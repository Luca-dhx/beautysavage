import mongoose from 'mongoose';

const invoiceSchema = new mongoose.Schema(
  {
    invoiceId: {
      type: String,
      default: null
    },
    invoiceNumber: {
      type: String,
      default: null
    },
    saleId: {
      type: String,
      required: true,
      unique: true,
      trim: true
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    status: {
      type: String,
      trim: true,
      default: 'draft'
    },
    totalAmount: {
      type: Number,
      default: 0
    },
    fileName: {
      type: String,
      default: null,
      trim: true
    },
    pdfPath: {
      type: String,
      default: null,
      trim: true
    },
    htmlContent: {
      type: String,
      default: ''
    },
    invoiceDate: {
      type: Date,
      default: () => new Date()
    },
    stripeInvoiceId: {
      type: String,
      default: null,
      sparse: true
    },
    stripeInvoiceNumber: {
      type: String,
      default: null
    },
    stripeInvoicePdfUrl: {
      type: String,
      default: null
    },
    stripeHostedUrl: {
      type: String,
      default: null
    },
    createdAt: {
      type: Date,
      default: () => new Date()
    }
  },
  {
    collection: 'invoices'
  }
);

const Invoice = mongoose.model('Invoice', invoiceSchema);
export default Invoice;
