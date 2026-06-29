// M10 — Composants présentiels du planning global (mobile-first, animés, accessibles).
// Aucune couleur hex en dur : type/statut → classes CSS (tokens --bs-*).
import { useEffect, useState, type ReactNode } from 'react';
import type { CalendarItem, CalendarItemType, RescheduleBookingPayload } from '@bs/api-client';

function pad2(n: number) { return String(n).padStart(2, '0'); }
function dateInputValue(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}
function fmtTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}
function fmtMoney(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—';
  return `${Number(n).toFixed(2).replace('.', ',')} €`;
}
export function fmtDayLabel(d: Date): string {
  return d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
}

// ── Badges ──────────────────────────────────────────────────────────────────
const PAYMENT_LABEL: Record<string, string> = {
  paid: 'Payé', deposit_paid: 'Acompte payé', pending: 'En attente', refunded: 'Remboursé', cancelled: 'Annulé',
};
export function PaymentStatusBadge({ status }: { status: string | null }) {
  if (!status) return null;
  const cls = ['paid', 'deposit_paid', 'pending', 'refunded', 'cancelled'].includes(status) ? status : 'neutral';
  return <span className={`pl-badge pl-badge--${cls}`} data-testid="pl-payment-badge">{PAYMENT_LABEL[status] || status}</span>;
}

export function RefundStatusBadge({ status }: { status: string | null }) {
  if (!status) return null;
  const label = status === 'refunded' ? 'Remboursé' : status === 'cancelled' ? 'Annulé' : status;
  const cls = status === 'refunded' ? 'refunded' : 'cancelled';
  return <span className={`pl-badge pl-badge--${cls}`} data-testid="pl-refund-badge">{label}</span>;
}

export function BalanceDueBadge({ amount }: { amount: number | null }) {
  if (!amount || amount <= 0) return null;
  return <span className="pl-badge pl-badge--balance" data-testid="pl-balance-badge">Solde {fmtMoney(amount)}</span>;
}

// ── Cartes ────────────────────────────────────────────────────────────────────
export function FormationSessionCard({ item, onSelect }: { item: CalendarItem; onSelect: (i: CalendarItem) => void }) {
  return (
    <button type="button" className={`pl-card pl-card--formation_session pl-card--${item.status}`} onClick={() => onSelect(item)} data-testid="pl-formation-card">
      <span className="pl-card__time">{fmtTime(item.startAt)}–{fmtTime(item.endAt)}</span>
      <span className="pl-card__title">{item.title}</span>
      {item.participant ? (
        <span className="pl-card__sub">{item.participant.placesLeft} place(s) restante(s) · {item.participant.reservedCount}/{item.participant.maxClients}</span>
      ) : null}
    </button>
  );
}

export function CalendarItemCard({ item, onSelect }: { item: CalendarItem; onSelect: (i: CalendarItem) => void }) {
  if (item.type === 'formation_session') return <FormationSessionCard item={item} onSelect={onSelect} />;
  const subtitle = item.type === 'blocked_slot' ? (item.title || 'Indisponible') : (item.client?.name || 'Client');
  return (
    <button type="button" className={`pl-card pl-card--${item.type} pl-card--${item.status}`} onClick={() => onSelect(item)} data-testid="pl-card">
      <span className="pl-card__time">{fmtTime(item.startAt)}–{fmtTime(item.endAt)}</span>
      <span className="pl-card__title">{item.title}</span>
      {item.type !== 'blocked_slot' ? <span className="pl-card__sub">{subtitle}</span> : null}
      <span className="pl-card__badges">
        <PaymentStatusBadge status={item.paymentStatus} />
        <BalanceDueBadge amount={item.balanceDueAmount} />
        <RefundStatusBadge status={item.refundStatus} />
      </span>
    </button>
  );
}

export function PlanningEmptyState({ label = 'Aucun événement' }: { label?: string }) {
  return (
    <div className="pl-empty" role="status">
      <div className="pl-empty__icon" aria-hidden="true"><i className="bi-calendar2-x" /></div>
      <p>{label}</p>
    </div>
  );
}

// ── Vues ────────────────────────────────────────────────────────────────────
export function MobileDayAgenda({ items, onSelect }: { items: CalendarItem[]; onSelect: (i: CalendarItem) => void }) {
  if (!items.length) return <PlanningEmptyState />;
  return (
    <div className="pl-agenda" data-testid="pl-agenda">
      {items.map((it) => <CalendarItemCard key={it.id} item={it} onSelect={onSelect} />)}
    </div>
  );
}

export function DayColumn({ date, items, onSelect }: { date: Date; items: CalendarItem[]; onSelect: (i: CalendarItem) => void }) {
  return (
    <div className="pl-daycol" data-testid="pl-daycol">
      <div className="pl-daycol__head">{date.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric' })}</div>
      {items.length ? items.map((it) => <CalendarItemCard key={it.id} item={it} onSelect={onSelect} />) : <span className="pl-card__sub">—</span>}
    </div>
  );
}

export function WeekView({ days, itemsByDay, onSelect }: {
  days: Date[];
  itemsByDay: Map<string, CalendarItem[]>;
  onSelect: (i: CalendarItem) => void;
}) {
  const keyOf = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  return (
    <div className="pl-week" data-testid="pl-week">
      {days.map((d) => <DayColumn key={keyOf(d)} date={d} items={itemsByDay.get(keyOf(d)) ?? []} onSelect={onSelect} />)}
    </div>
  );
}

// Filtres (barre de chips ; nommée « drawer » par cohérence de spec, rendu inline mobile-first).
const TYPE_FILTERS: Array<{ value: CalendarItemType | null; label: string }> = [
  { value: null, label: 'Tout' },
  { value: 'service_booking', label: 'Réservations' },
  { value: 'formation_session', label: 'Formations' },
  { value: 'blocked_slot', label: 'Bloqués' },
];
export function CalendarFiltersDrawer({ value, onChange }: { value: CalendarItemType | null; onChange: (v: CalendarItemType | null) => void }) {
  return (
    <div className="pl-filterbar" role="tablist" aria-label="Filtres du planning">
      {TYPE_FILTERS.map((f) => (
        <button
          key={f.label}
          type="button"
          role="tab"
          aria-selected={value === f.value}
          className={`pl-filter${value === f.value ? ' pl-filter--active' : ''}`}
          onClick={() => onChange(f.value)}
        >
          {f.label}
        </button>
      ))}
    </div>
  );
}

// ── Actions sur réservation ───────────────────────────────────────────────────
// ── Formulaire de report (mobile-first) ────────────────────────────────────────
// M11B — Report du créneau : choix d'une date + heure ; la durée est préservée (déduite du
// créneau actuel). États loading/error/success. Aucune notion de prestataire.
export function RescheduleForm({ item, onReschedule, onDone }: {
  item: CalendarItem;
  onReschedule: (i: CalendarItem, payload: RescheduleBookingPayload) => Promise<void>;
  onDone: () => void;
}) {
  const durationMs = Math.max(0, new Date(item.endAt).getTime() - new Date(item.startAt).getTime());
  const [date, setDate] = useState(dateInputValue(item.startAt));
  const [time, setTime] = useState(fmtTime(item.startAt));
  const [reason, setReason] = useState('');
  const [phase, setPhase] = useState<'idle' | 'submitting' | 'error' | 'success'>('idle');
  const [error, setError] = useState('');

  const submit = async () => {
    if (!date || !time) { setPhase('error'); setError('Date et heure requises.'); return; }
    const newStartAt = `${date}T${time}`;
    const startMs = new Date(newStartAt).getTime();
    if (Number.isNaN(startMs)) { setPhase('error'); setError('Créneau invalide.'); return; }
    const newEndAt = new Date(startMs + durationMs).toISOString();
    setPhase('submitting'); setError('');
    try {
      await onReschedule(item, { newStartAt, newEndAt, reason: reason.trim() || undefined });
      setPhase('success');
    } catch (e) {
      setPhase('error');
      setError(e instanceof Error && e.message ? e.message : 'Report impossible.');
    }
  };

  if (phase === 'success') {
    return (
      <div className="pl-reschedule" data-testid="pl-reschedule-success" role="status">
        <p className="pl-reschedule__ok"><i className="bi-check-circle" aria-hidden="true" /> Créneau reporté.</p>
        <button type="button" className="pl-actionbtn pl-actionbtn--primary" onClick={onDone}>Fermer</button>
      </div>
    );
  }

  return (
    <div className="pl-reschedule" data-testid="pl-reschedule-form">
      <label className="pl-field">
        <span className="pl-field__label">Nouvelle date</span>
        <input className="pl-field__input" type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-label="Nouvelle date" />
      </label>
      <label className="pl-field">
        <span className="pl-field__label">Nouvelle heure</span>
        <input className="pl-field__input" type="time" value={time} onChange={(e) => setTime(e.target.value)} aria-label="Nouvelle heure" />
      </label>
      <label className="pl-field">
        <span className="pl-field__label">Motif (optionnel)</span>
        <input className="pl-field__input" type="text" value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)} aria-label="Motif du report" />
      </label>
      {phase === 'error' ? <p className="pl-reschedule__err" role="alert" data-testid="pl-reschedule-error">{error}</p> : null}
      <div className="pl-reschedule__actions">
        <button type="button" className="pl-actionbtn pl-actionbtn--primary" disabled={phase === 'submitting'} onClick={() => void submit()} data-testid="pl-reschedule-submit">
          {phase === 'submitting' ? 'Report en cours…' : 'Confirmer le report'}
        </button>
        <button type="button" className="pl-actionbtn" disabled={phase === 'submitting'} onClick={onDone}>Annuler</button>
      </div>
    </div>
  );
}

export function BookingActionsPanel({ item, onCancel, onMarkPaid, onReschedule, busy }: {
  item: CalendarItem;
  onCancel: (i: CalendarItem) => void;
  onMarkPaid: (i: CalendarItem) => void;
  onReschedule: (i: CalendarItem, payload: RescheduleBookingPayload) => Promise<void>;
  busy?: boolean;
}) {
  const [showReschedule, setShowReschedule] = useState(false);
  if (item.type !== 'service_booking') return null;
  const a = item.actionLinks;

  if (showReschedule) {
    return <RescheduleForm item={item} onReschedule={onReschedule} onDone={() => setShowReschedule(false)} />;
  }

  return (
    <div className="pl-actions" data-testid="pl-actions">
      {a.markBalancePaid ? (
        <button type="button" className="pl-actionbtn pl-actionbtn--primary" disabled={busy} onClick={() => onMarkPaid(item)}>
          <i className="bi-cash-coin" aria-hidden="true" /> Marquer le solde payé sur place
        </button>
      ) : null}
      {a.reschedule ? (
        <button type="button" className="pl-actionbtn" disabled={busy} onClick={() => setShowReschedule(true)} data-testid="pl-reschedule-open">
          <i className="bi-arrow-left-right" aria-hidden="true" /> Reporter le créneau
        </button>
      ) : null}
      {a.cancel ? (
        <button type="button" className="pl-actionbtn pl-actionbtn--danger" disabled={busy} onClick={() => onCancel(item)}>
          <i className="bi-x-circle" aria-hidden="true" /> Annuler (remboursement si éligible)
        </button>
      ) : null}
    </div>
  );
}

// ── Drawer détail ─────────────────────────────────────────────────────────────
export function CalendarItemDetailDrawer({ item, onClose, onCancel, onMarkPaid, onReschedule, busy }: {
  item: CalendarItem | null;
  onClose: () => void;
  onCancel: (i: CalendarItem) => void;
  onMarkPaid: (i: CalendarItem) => void;
  onReschedule: (i: CalendarItem, payload: RescheduleBookingPayload) => Promise<void>;
  busy?: boolean;
}) {
  useEffect(() => {
    if (!item) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [item, onClose]);

  if (!item) return null;
  const isBooking = item.type === 'service_booking';
  return (
    <>
      <div className="pl-overlay" onClick={onClose} aria-hidden="true" />
      <div className="pl-drawer" role="dialog" aria-modal="true" aria-label={item.title} data-testid="pl-drawer">
        <div className="pl-drawer__head">
          <span className="pl-drawer__title">{item.title}</span>
          <button type="button" className="pl-iconbtn" onClick={onClose} aria-label="Fermer"><i className="bi-x-lg" aria-hidden="true" /></button>
        </div>
        <div className="pl-drawer__body">
          <DrawerDetailRows item={item} />
          {isBooking ? (
            <div className="pl-section">
              <span className="pl-section__title">Paiement</span>
              <div className="pl-row"><span>Total</span><strong>{fmtMoney(item.totalAmount)}</strong></div>
              <div className="pl-row"><span>Payé en ligne</span><strong data-testid="pl-paid-online">{fmtMoney(item.amountPaidOnline)}</strong></div>
              <div className="pl-row"><span>Acompte</span><span>{fmtMoney(item.depositAmount)}</span></div>
              <div className="pl-row"><span>Solde à payer sur place</span><strong data-testid="pl-balance-due">{fmtMoney(item.balanceDueAmount)}</strong></div>
              <span className="pl-card__badges">
                <PaymentStatusBadge status={item.paymentStatus} />
                <RefundStatusBadge status={item.refundStatus} />
              </span>
            </div>
          ) : null}
          {item.participant ? (
            <div className="pl-section">
              <span className="pl-section__title">Participants</span>
              <div className="pl-row"><span>Inscrits</span><strong>{item.participant.reservedCount}/{item.participant.maxClients}</strong></div>
              <div className="pl-row"><span>Places restantes</span><strong>{item.participant.placesLeft}</strong></div>
            </div>
          ) : null}
          <BookingActionsPanel item={item} onCancel={onCancel} onMarkPaid={onMarkPaid} onReschedule={onReschedule} busy={busy} />
        </div>
      </div>
    </>
  );
}

function DrawerDetailRows({ item }: { item: CalendarItem }) {
  return (
    <div className="pl-section" data-testid="pl-detail">
      <span className="pl-section__title">Détail</span>
      <div className="pl-row"><span>Quand</span><strong>{fmtTime(item.startAt)}–{fmtTime(item.endAt)}</strong></div>
      <div className="pl-row"><span>Statut</span><span>{item.status}</span></div>
      {item.client?.name ? <div className="pl-row"><span>Client</span><span>{item.client.name}</span></div> : null}
    </div>
  );
}

export function PlanningSkeleton(): ReactNode {
  return <div aria-hidden="true"><div className="pl-skeleton" /><div className="pl-skeleton" /><div className="pl-skeleton" /></div>;
}
