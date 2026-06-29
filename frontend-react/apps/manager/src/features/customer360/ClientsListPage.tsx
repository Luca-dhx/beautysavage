// M12 — Liste / recherche clients (point d'entrée du Customer 360). Recherche rapide (nom/prénom/
// e-mail), cartes résumé, tap → fiche 360. Mobile-first, cards, aucune table.
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ErrorState } from '@bs/ui';
import { useCustomerSearch } from './useCustomer360';
import { ClientSearchCard, CustomerSkeleton, CustomerEmptyState } from './components';
import './customer360.css';

export function ClientsListPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const { data, isLoading, isError } = useCustomerSearch(search);

  return (
    <section className="c3-page" data-testid="c3-clients-page">
      <div className="c3-searchbar">
        <i className="bi-search" aria-hidden="true" />
        <input
          className="c3-searchinput"
          type="search"
          inputMode="search"
          placeholder="Rechercher un client (nom, e-mail)…"
          aria-label="Rechercher un client"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {isLoading ? <CustomerSkeleton /> : null}
      {isError ? <ErrorState title="Recherche indisponible." detail="Réessayez plus tard." /> : null}
      {!isLoading && !isError && data && data.length === 0 ? (
        <CustomerEmptyState label={search ? 'Aucun client trouvé' : 'Aucun client'} icon="bi-person-x" />
      ) : null}

      {!isLoading && !isError && data && data.length > 0 ? (
        <div className="c3-clientlist" data-testid="c3-clientlist">
          {data.map((card) => (
            <ClientSearchCard key={card.id} card={card} onOpen={(cid) => navigate(`/clients/${cid}`)} />
          ))}
        </div>
      ) : null}
    </section>
  );
}
