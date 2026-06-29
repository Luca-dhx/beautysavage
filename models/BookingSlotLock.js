import mongoose from 'mongoose';

const bookingSlotLockSchema = new mongoose.Schema({
  practitionerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'PractitionerProfile',
    required: true
  },
  bookingId: {
    type: String,
    required: true,
    trim: true
  },
  slotStartAt: {
    type: Date,
    required: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
}, { collection: 'booking_slot_locks' });

// M10/M11 — `practitionerId` = entité institut UNIQUE : cet index unique est déjà GLOBAL de facto
// (un seul détenteur possible par minute). Conservé legacy.
bookingSlotLockSchema.index({ practitionerId: 1, slotStartAt: 1 }, { unique: true });
bookingSlotLockSchema.index({ bookingId: 1 });
// M11B — l'index GLOBAL UNIQUE `{ slotStartAt } unique` (garantie double-booking SANS practitionerId)
// est créé VOLONTAIREMENT via scripts/cleanupPractitionerLegacy.js (--create-global-index, après
// contrôle de doublons), JAMAIS au boot. On NE déclare PAS `{ slotStartAt }` ici pour laisser au
// script la maîtrise exclusive de ce pattern d'index (clé identique = conflit MongoDB).

const BookingSlotLock = mongoose.model('BookingSlotLock', bookingSlotLockSchema);
export default BookingSlotLock;
