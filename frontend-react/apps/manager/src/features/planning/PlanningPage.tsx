// M10 — Planning global institut, façon Planity. Vue JOUR par défaut (mobile-first),
// vue SEMAINE (desktop). Navigation jour/semaine précédent·e/suivant·e, filtres par type,
// drawer de détail + actions. Calendrier GLOBAL (entité institut unique).
import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type { CalendarItem, CalendarItemType, RescheduleBookingPayload } from '@bs/api-client';
import {
  usePlanning,
  planningRange,
  groupItemsByDay,
  addDays,
  startOfDay,
  type PlanningView,
} from './usePlanning';
import {
  MobileDayAgenda,
  WeekView,
  CalendarFiltersDrawer,
  CalendarItemDetailDrawer,
  PlanningSkeleton,
  fmtDayLabel,
} from './components';
import './planning.css';

function parseDateParam(value: string | undefined): Date {
  if (value) {
    const d = new Date(`${value}T12:00:00`);
    if (!Number.isNaN(d.getTime())) return startOfDay(d);
  }
  return startOfDay(new Date());
}
function toDateParam(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Choisit la vue (jour/semaine) — mobile-first : la vue jour est le défaut. */
export function PlanningCalendar({ items, date, view, onSelect }: {
  items: CalendarItem[];
  date: Date;
  view: PlanningView;
  onSelect: (i: CalendarItem) => void;
}) {
  if (view === 'week') {
    const { start } = planningRange(date, 'week');
    const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
    return <WeekView days={days} itemsByDay={groupItemsByDay(items)} onSelect={onSelect} />;
  }
  return <MobileDayAgenda items={items} onSelect={onSelect} />;
}

export function PlanningPage() {
  const navigate = useNavigate();
  const params = useParams();
  const [date, setDate] = useState<Date>(() => parseDateParam(params.date));
  const [view, setView] = useState<PlanningView>('day');
  const [type, setType] = useState<CalendarItemType | null>(null);
  const [selected, setSelected] = useState<CalendarItem | null>(null);
  const [busy, setBusy] = useState(false);

  const { items, isLoading, cancel, markPaid, reschedule, refetch } = usePlanning({ date, view, type });

  const title = useMemo(() => {
    if (view === 'week') {
      const { start, end } = planningRange(date, 'week');
      return `Semaine du ${start.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })} au ${addDays(end, -1).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}`;
    }
    return fmtDayLabel(date);
  }, [date, view]);

  const step = view === 'week' ? 7 : 1;
  const go = (delta: number) => {
    const next = addDays(date, delta * step);
    setDate(next);
    navigate(`/planning/${toDateParam(next)}`, { replace: true });
  };

  const onCancel = async (item: CalendarItem) => {
    setBusy(true);
    try { await cancel(item.id); setSelected(null); } finally { setBusy(false); }
  };
  const onMarkPaid = async (item: CalendarItem) => {
    setBusy(true);
    try { await markPaid(item.id); setSelected(null); } finally { setBusy(false); }
  };
  // M11B — report : la mutation lève en cas d'échec (affiché par le formulaire) ; au succès on
  // rafraîchit le planning et ferme le drawer.
  const onReschedule = async (item: CalendarItem, payload: RescheduleBookingPayload) => {
    await reschedule(item.id, payload);
    refetch();
    setSelected(null);
  };

  return (
    <section className="pl-page">
      <div className="pl-toolbar">
        <button type="button" className="pl-navbtn" aria-label="Précédent" onClick={() => go(-1)}><i className="bi-chevron-left" aria-hidden="true" /></button>
        <button type="button" className="pl-navbtn" aria-label="Aujourd'hui" onClick={() => { const t = startOfDay(new Date()); setDate(t); navigate(`/planning/${toDateParam(t)}`, { replace: true }); }}><i className="bi-calendar-check" aria-hidden="true" /></button>
        <button type="button" className="pl-navbtn" aria-label="Suivant" onClick={() => go(1)}><i className="bi-chevron-right" aria-hidden="true" /></button>
        <span className="pl-toolbar__title" data-testid="pl-title">{title}</span>
        <span className="pl-viewtoggle">
          <button type="button" className={`pl-viewbtn${view === 'day' ? ' pl-viewbtn--active' : ''}`} onClick={() => setView('day')}>Jour</button>
          <button type="button" className={`pl-viewbtn${view === 'week' ? ' pl-viewbtn--active' : ''}`} onClick={() => setView('week')}>Semaine</button>
        </span>
      </div>

      <CalendarFiltersDrawer value={type} onChange={setType} />

      {isLoading ? <PlanningSkeleton /> : (
        <PlanningCalendar items={items} date={date} view={view} onSelect={setSelected} />
      )}

      <CalendarItemDetailDrawer
        item={selected}
        onClose={() => setSelected(null)}
        onCancel={onCancel}
        onMarkPaid={onMarkPaid}
        onReschedule={onReschedule}
        busy={busy}
      />
    </section>
  );
}
