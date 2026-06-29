// services/calendar/globalAvailabilityService.js
// M10 — Disponibilité + réservation GLOBALES (institut unique). Le backend N'EXIGE PLUS de
// practitionerId : il résout l'entité institut. Un `practitionerId` legacy éventuellement
// fourni est ACCEPTÉ mais IGNORÉ (toujours l'institut). Le verrou anti-double-booking
// (index unique + BookingSlotLock) devient global puisqu'il n'y a qu'une entité.
//
// Réutilise le moteur de disponibilité existant (serviceAvailabilityService) sans le casser.
import crypto from 'node:crypto';
import PractitionerSchedule from '../../models/PractitionerSchedule.js';
import Service from '../../models/Service.js';
import {
  computeAvailableSlotsForPractitioner,
  createServiceBookingWithProtection,
  sortSlotsByStart
} from '../serviceAvailabilityService.js';
import { resolveInstitutePractitionerProfile } from './instituteCalendarContext.js';

function buildBookingId() {
  const suffix = crypto.randomUUID().split('-')[0];
  return `BKG-${Date.now()}-${suffix}`;
}

function instituteNotConfiguredError() {
  return Object.assign(new Error("L'institut n'a pas de calendrier configuré."), {
    status: 409,
    code: 'INSTITUTE_NOT_CONFIGURED'
  });
}

/**
 * Créneaux disponibles GLOBAUX pour une prestation à une date donnée (entité institut).
 * Aucun practitionerId requis.
 * @returns {Promise<Array>} créneaux triés ({ start, end, startAt, endAt })
 */
export async function getGlobalAvailableSlots({ serviceId, dateStr, now = new Date(), session = null } = {}) {
  if (!serviceId || !dateStr) return [];
  const [service, institute] = await Promise.all([
    Service.findById(serviceId).session(session || null).lean(),
    resolveInstitutePractitionerProfile({ session })
  ]);
  if (!service || !service.isActive || !service.isBookable) return [];
  if (!institute) return [];

  const schedule = await PractitionerSchedule.findOne({ practitionerId: institute._id })
    .session(session || null)
    .lean();
  if (!schedule) return [];

  const slots = await computeAvailableSlotsForPractitioner({
    practitioner: institute,
    schedule,
    service,
    dateStr,
    now,
    session
  });
  return sortSlotsByStart(slots);
}

/**
 * Crée une réservation prestation rattachée à L'INSTITUT (calendrier global).
 * `bookingData.practitionerId` legacy éventuel est IGNORÉ. Anti-double-booking global via
 * createServiceBookingWithProtection (index unique + slot locks).
 *
 * @param {{ bookingData: object, now?: Date, session?: any }} params
 * @returns {Promise<{ booking: object, service: object, practitioner: object }>}
 */
export async function createGlobalServiceBooking({ bookingData = {}, now = new Date(), session = null } = {}) {
  const institute = await resolveInstitutePractitionerProfile({ session });
  if (!institute) throw instituteNotConfiguredError();

  const service = await Service.findById(bookingData.serviceId).session(session || null).lean();
  if (!service) {
    throw Object.assign(new Error('Prestation introuvable.'), { status: 404, code: 'SERVICE_NOT_FOUND' });
  }

  // Le practitionerId legacy fourni (le cas échéant) est volontairement écrasé par l'institut.
  const normalized = {
    ...bookingData,
    bookingId: bookingData.bookingId || buildBookingId(),
    practitionerId: institute._id
  };

  return createServiceBookingWithProtection({ bookingData: normalized, service, now, session });
}

export default {
  getGlobalAvailableSlots,
  createGlobalServiceBooking
};
