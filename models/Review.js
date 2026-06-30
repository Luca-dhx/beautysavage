import mongoose from 'mongoose';

// C3 — Modération. Défaut 'published' (rétro-compat : avis existants sans champ = visibles via la
// requête vitrine tolérante). Un admin peut masquer (rejected) ou repasser en attente.
export const REVIEW_STATUSES = Object.freeze(['pending', 'published', 'rejected']);

const reviewSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    formationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Formation',
      required: true
    },
    rating: {
      type: Number,
      required: true,
      min: 1,
      max: 5
    },
    comment: {
      type: String,
      trim: true,
      default: ''
    },
    status: {
      type: String,
      enum: REVIEW_STATUSES,
      default: 'published'
    },
    moderatedAt: { type: Date, default: null },
    moderatedByAdminId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    createdAt: {
      type: Date,
      default: () => new Date()
    }
  },
  { collection: 'reviews' }
);

reviewSchema.index({ userId: 1, formationId: 1 }, { unique: true });

const Review = mongoose.model('Review', reviewSchema);
export default Review;
