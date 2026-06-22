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

bookingSlotLockSchema.index({ practitionerId: 1, slotStartAt: 1 }, { unique: true });
bookingSlotLockSchema.index({ bookingId: 1 });

const BookingSlotLock = mongoose.model('BookingSlotLock', bookingSlotLockSchema);
export default BookingSlotLock;
