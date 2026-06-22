import mongoose from 'mongoose';

const practitionerProfileSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true
  },
  displayName: { type: String, default: '', trim: true },
  bio: { type: String, default: '', trim: true },
  photo: { type: String, default: null },
  color: { type: String, default: '#c5bb96' },

  slotGranularity: {
    type: Number,
    enum: [15, 30, 45, 60],
    default: 30
  },

  serviceIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Service' }],

  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now }
}, { collection: 'practitioner_profiles' });

practitionerProfileSchema.index({ userId: 1 }, { unique: true });

const PractitionerProfile = mongoose.model('PractitionerProfile', practitionerProfileSchema);
export default PractitionerProfile;
