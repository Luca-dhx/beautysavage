// C2 — « Mes formations » (vitrine authentifiée) : liste des formations distancielles acquises +
// progression. Mobile-first, cards (zéro table).
import { Link } from 'react-router-dom';
import { LoadingState, EmptyState } from '@bs/ui';
import { useMyLearningFormations } from '../features/learning/hooks';
import '../features/learning/learning.css';

export function MyFormationsPage() {
  const query = useMyLearningFormations();

  if (query.isPending) return <LoadingState label="Chargement de vos formations…" />;
  if (query.isError) {
    return (
      <section>
        <h1>Mes formations</h1>
        <EmptyState label="Connectez-vous pour accéder à vos formations." />
        <p style={{ marginTop: 'var(--bs-space-2)' }}><Link className="bs-btn" to="/connexion">Se connecter</Link></p>
      </section>
    );
  }
  const formations = query.data ?? [];

  return (
    <section className="bs-myf">
      <h1 className="bs-myf__title">Mes formations</h1>
      {formations.length === 0 ? (
        <EmptyState label="Vous n’avez pas encore de formation distancielle." />
      ) : (
        <div className="bs-myf__grid">
          {formations.map((f) => (
            <Link key={f.formationId} to={`/mes-formations/${f.formationId}`} className="bs-myf__card">
              <div className="bs-myf__media">
                {f.coverImage ? <img src={f.coverImage} alt="" loading="lazy" /> : <span className="bs-myf__ph" aria-hidden="true"><i className="bi bi-mortarboard" /></span>}
                {f.completedAt ? <span className="bs-myf__badge"><i className="bi bi-patch-check" aria-hidden="true" /> Terminée</span> : null}
              </div>
              <div className="bs-myf__body">
                <h2 className="bs-myf__name">{f.name}</h2>
                <div className="bs-lrn__progress"><span className="bs-lrn__progressbar" style={{ width: `${f.progressPct}%` }} /></div>
                <span className="bs-myf__pct">{f.progressPct}% terminé</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
