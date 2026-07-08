import mongoose from 'mongoose';

import Review from '../../models/Review.js';
import {
  combineReviewFilters,
  buildPublishedReviewStatusFilter,
  buildReviewTargetFilter
} from './reviewTargeting.js';

function buildPublicMatch(targetType, targetId) {
  return combineReviewFilters(
    buildReviewTargetFilter(targetType, new mongoose.Types.ObjectId(targetId)),
    buildPublishedReviewStatusFilter()
  );
}

export async function getPublishedReviewStats(targetType, targetId) {
  const aggregation = await Review.aggregate([
    { $match: buildPublicMatch(targetType, targetId) },
    {
      $group: {
        _id: null,
        averageRating: { $avg: '$rating' },
        reviewCount: { $sum: 1 }
      }
    }
  ]);

  const stats = aggregation[0] || { averageRating: 0, reviewCount: 0 };
  return {
    averageRating:
      typeof stats.averageRating === 'number' ? Number(stats.averageRating.toFixed(2)) : 0,
    reviewCount: Number.isFinite(Number(stats.reviewCount)) ? Number(stats.reviewCount) : 0
  };
}

export async function listPublishedReviews(
  targetType,
  targetId,
  { page = 1, sort = 'recent', pageSize = 5 } = {}
) {
  const sortStage =
    sort === 'best'
      ? { rating: -1, createdAt: -1, _id: -1 }
      : { createdAt: -1, rating: -1, _id: -1 };

  const match = buildPublicMatch(targetType, targetId);
  const cursor = Review.find(match)
    .sort(sortStage)
    .skip((page - 1) * pageSize)
    .limit(pageSize)
    .select({ rating: 1, comment: 1, createdAt: 1, _id: 0 });
  const [reviews, total] = await Promise.all([cursor.lean(), Review.countDocuments(match)]);

  return {
    reviews,
    page,
    hasMore: page * pageSize < total,
    total
  };
}
