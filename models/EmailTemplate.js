import mongoose from 'mongoose';

const emailTemplateSchema = new mongoose.Schema(
  {
    functionName: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      unique: true
    },
    subject: {
      type: String,
      default: ''
    },
    bodyHtml: {
      type: String,
      default: ''
    },
    fullHtml: {
      type: String,
      default: ''
    },
    mode: {
      type: String,
      enum: ['text', 'html'],
      lowercase: true,
      trim: true,
      default: 'text'
    },
    categoryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'EmailTemplateCategory',
      default: null
    },
    recipient: {
      type: String,
      enum: ['client', 'institute', 'both'],
      default: 'client'
    },
    isMetadataOnly: {
      type: Boolean,
      default: false
    }
  },
  {
    timestamps: true,
    collection: 'email_templates'
  }
);

emailTemplateSchema.index({ functionName: 1 }, { unique: true });

const EmailTemplate = mongoose.model('EmailTemplate', emailTemplateSchema);
export default EmailTemplate;
