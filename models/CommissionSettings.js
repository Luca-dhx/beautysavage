import mongoose from 'mongoose';

const commissionReminderSchema = new mongoose.Schema(
  { daysBeforeDue: { type: Number, required: true, min: 1 } },
  { _id: false }
);

// Document singleton — un seul document en base
const commissionSettingsSchema = new mongoose.Schema(
  {
    latePaymentDays: { type: Number, default: 15, min: 2 },
    // Rappels automatiques : liste de { daysBeforeDue } (1 ≤ daysBeforeDue < latePaymentDays)
    reminders: { type: [commissionReminderSchema], default: [] },
    // Date simulée pour les tests (dev uniquement) — null = date réelle
    simulatedDate: { type: Date, default: null },
    updatedAt: { type: Date, default: Date.now }
  },
  { collection: 'commissionsettings' }
);

const CommissionSettings = mongoose.model('CommissionSettings', commissionSettingsSchema);
export default CommissionSettings;
