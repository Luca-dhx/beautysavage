// C3 — Modération des avis (manager, admin/dev). Liste + changement de statut
// (pending/published/rejected). La vitrine n'affiche que les avis publiés (ou legacy sans statut).
import mongoose from 'mongoose';

import Review, { REVIEW_STATUSES } from '../models/Review.js';
import Formation from '../models/Formation.js';
import User from '../models/user.js';

const isId = v => mongoose.Types.ObjectId.isValid(v);

function buildReviewPayload(doc, { formationName, authorName }) {
  // Statut effectif : un avis legacy sans champ est considéré 'published'.
  const status = doc.status || 'published';
  return {
    id: String(doc._id),
    formationId: doc.formationId ? String(doc.formationId) : null,
    formationName: formationName || 'Formation',
    authorName: authorName || 'Client',
    rating: doc.rating,
    comment: doc.comment || '',
    status,
    createdAt: doc.createdAt || null,
    moderatedAt: doc.moderatedAt || null
  };
}

export async function listReviewsForModeration(req, res) {
  try {
    const filter = {};
    const status = String(req.query.status || '').trim();
    if (REVIEW_STATUSES.includes(status)) {
      filter.status = status === 'published'
        ? { $in: ['published', null] } // inclut les legacy sans statut
        : status;
    }
    if (req.query.formationId && isId(req.query.formationId)) {
      filter.formationId = req.query.formationId;
    }
    const reviews = await Review.find(filter).sort({ createdAt: -1 }).limit(200).lean();

    const formationIds = [...new Set(reviews.map(r => String(r.formationId)).filter(Boolean))];
    const userIds = [...new Set(reviews.map(r => String(r.userId)).filter(Boolean))];
    const [formations, users] = await Promise.all([
      formationIds.length ? Formation.find({ _id: { $in: formationIds } }).select('name').lean() : [],
      userIds.length ? User.find({ _id: { $in: userIds } }).select('firstName lastName email').lean() : []
    ]);
    const formationById = new Map(formations.map(f => [String(f._id), f.name]));
    const userById = new Map(users.map(u => [String(u._id), `${u.firstName || ''} ${u.lastName || ''}`.trim() || u.email]));

    const payload = reviews.map(r => buildReviewPayload(r, {
      formationName: formationById.get(String(r.formationId)),
      authorName: userById.get(String(r.userId))
    }));
    const counts = { pending: 0, published: 0, rejected: 0 };
    for (const r of payload) counts[r.status] = (counts[r.status] || 0) + 1;
    return res.json({ ok: true, reviews: payload, counts });
  } catch (err) {
    console.error('[reviewModeration] list', err);
    return res.status(500).json({ ok: false, error: 'Erreur serveur.' });
  }
}

export async function moderateReview(req, res) {
  try {
    const { reviewId } = req.params;
    const status = String(req.body?.status || '');
    if (!isId(reviewId)) return res.status(400).json({ ok: false, error: 'Identifiant invalide.' });
    if (!REVIEW_STATUSES.includes(status)) return res.status(400).json({ ok: false, error: 'Statut invalide.' });
    const doc = await Review.findById(reviewId);
    if (!doc) return res.status(404).json({ ok: false, error: 'Avis introuvable.' });
    doc.status = status;
    doc.moderatedAt = new Date();
    doc.moderatedByAdminId = req.sessionUser?._id || null;
    await doc.save();
    return res.json({ ok: true, review: { id: String(doc._id), status: doc.status } });
  } catch (err) {
    console.error('[reviewModeration] moderate', err);
    return res.status(500).json({ ok: false, error: 'Erreur serveur.' });
  }
}
