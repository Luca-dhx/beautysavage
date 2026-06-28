import { Routes, Route } from 'react-router-dom';
import { RequireAuth } from '@bs/auth';
import { PublicLayout } from './layouts/PublicLayout';
import { Placeholder } from './pages/Placeholder';

// Routing vitrine R0 — placeholders uniquement (cf. rapport 147).
export function App() {
  return (
    <Routes>
      <Route element={<PublicLayout />}>
        {/* Publiques */}
        <Route index element={<Placeholder title="Accueil" description="Vitrine publique Beauty Savage." />} />
        <Route path="prestations" element={<Placeholder title="Prestations" description="Catalogue des prestations." />} />
        <Route path="formations" element={<Placeholder title="Formations" description="Catalogue des formations." />} />
        <Route path="formation/:id" element={<Placeholder title="Détail formation" description="Fiche d'une formation." />} />
        <Route path="produits" element={<Placeholder title="Produits" description="Catalogue des produits." />} />
        <Route path="cartes-cadeaux" element={<Placeholder title="Cartes cadeaux" description="Achat de cartes cadeaux." />} />
        <Route path="connexion" element={<Placeholder title="Connexion" description="Connexion client." />} />
        <Route path="paiement/succes" element={<Placeholder title="Paiement réussi" description="Retour Stripe (succès)." />} />
        <Route path="paiement/annule" element={<Placeholder title="Paiement annulé" description="Retour Stripe (annulation)." />} />

        {/* Client (RequireAuth) */}
        <Route element={<RequireAuth loginPath="/connexion" />}>
          <Route path="panier" element={<Placeholder title="Panier" description="Récapitulatif du panier." />} />
          <Route path="checkout" element={<Placeholder title="Checkout" description="Tunnel de paiement (UnifiedCheckout, R2)." />} />
        </Route>

        <Route path="*" element={<Placeholder title="Page introuvable" description="404." />} />
      </Route>
    </Routes>
  );
}
