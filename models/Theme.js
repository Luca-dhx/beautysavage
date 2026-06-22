import mongoose from 'mongoose';

const colorsSchema = new mongoose.Schema(
  {
    primary: { type: String, required: true, trim: true },
    secondary: { type: String, required: true, trim: true },
    background: { type: String, required: true, trim: true },
    surface: { type: String, required: true, trim: true },
    text: { type: String, required: true, trim: true }
  },
  { _id: false }
);

const derivedTokensSchema = new mongoose.Schema(
  {
    surfaceHeader: { type: String, trim: true, default: null },
    accent: { type: String, trim: true, default: null },
    accentStrong: { type: String, trim: true, default: null }
  },
  { _id: false }
);

const themeSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, unique: true },
    colors: { type: colorsSchema, required: true },
    derivedTokens: {
      type: derivedTokensSchema,
      default: () => ({ surfaceHeader: null, accent: null, accentStrong: null })
    },
    logoUrl: { type: String, trim: true, default: '' },
    slogan: { type: String, trim: true, default: '' },
    isActive: { type: Boolean, default: false },
    createdAt: { type: Date, default: () => new Date() }
  },
  {
    timestamps: true,
    collection: 'themes'
  }
);

const Theme = mongoose.model('Theme', themeSchema);
export default Theme;
