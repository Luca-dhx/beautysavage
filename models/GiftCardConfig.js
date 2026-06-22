import mongoose from 'mongoose';

const giftCardConfigSchema = new mongoose.Schema(
  {
    minAmount: {
      type: Number,
      required: true,
      min: 0,
      default: 50
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
    }
  },
  {
    collection: 'giftCardConfigs',
    timestamps: true
  }
);

const GiftCardConfig = mongoose.model('GiftCardConfig', giftCardConfigSchema);
export default GiftCardConfig;
