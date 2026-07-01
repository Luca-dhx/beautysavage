import { useQuery } from '@tanstack/react-query';
import { Badge, LoadingState, ErrorState, EmptyState } from '@bs/ui';
import { getFormationSessions, type PublicFormationSession } from '@bs/api-client';

// RX3 — Sessions présentielles d'une formation (affichage réel : date, durée, places restantes,
// disponibilité). Consomme le wrapper api-client (champs sûrs, jamais le token QR). Lecture seule :
// l'achat de session n'est pas encore câblé en React (documenté) — on n'affiche PAS de faux bouton.

function fmtDate(iso: string | null): string {
  if (!iso) return 'Date à confirmer';
  try {
    return new Date(iso).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  } catch {
    return 'Date à confirmer';
  }
}

function SessionCard({ session }: { session: PublicFormationSession }) {
  const full = session.placesRemaining <= 0 || !session.isAvailable;
  const firstDay = session.schedule?.[0];
  return (
    <li className="td-session">
      <div className="td-session__main">
        <span className="td-session__date">{fmtDate(session.startDate)}</span>
        <span className="td-session__meta">
          {session.durationLabel ? <span>{session.durationLabel}</span> : null}
          {firstDay?.startTime ? (
            <span>
              {firstDay.startTime}
              {firstDay.endTime ? `–${firstDay.endTime}` : ''}
            </span>
          ) : null}
        </span>
      </div>
      {full ? (
        <Badge tone="muted">Complet</Badge>
      ) : (
        <Badge tone="success">{session.placesRemaining} place{session.placesRemaining > 1 ? 's' : ''}</Badge>
      )}
    </li>
  );
}

export function FormationSessions({ formationId }: { formationId: string }) {
  const { data, isPending, isError } = useQuery({
    queryKey: ['formation', 'sessions', formationId],
    queryFn: ({ signal }) => getFormationSessions(formationId, signal),
    staleTime: 30_000,
  });

  return (
    <section className="td-section" aria-label="Prochaines sessions">
      <h2 className="td-section__title">Prochaines sessions</h2>
      {isPending ? <LoadingState label="Chargement des sessions…" /> : null}
      {isError ? <ErrorState title="Sessions indisponibles pour le moment." /> : null}
      {!isPending && !isError ? (
        data && data.length ? (
          <ul className="td-sessions">
            {data.map((s) => (
              <SessionCard key={s.id} session={s} />
            ))}
          </ul>
        ) : (
          <EmptyState label="Aucune session programmée pour le moment." />
        )
      ) : null}
    </section>
  );
}
