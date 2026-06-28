import { Routes, Route } from 'react-router-dom';
import { PublicLayout } from './layouts/PublicLayout';
import { Placeholder } from './pages/Placeholder';
import { HomePage } from './pages/HomePage';
import { ServicesPage } from './pages/ServicesPage';
import { ServiceDetailPage } from './pages/ServiceDetailPage';
import { TrainingsPage } from './pages/TrainingsPage';
import { TrainingDetailPage } from './pages/TrainingDetailPage';
import { ProductsPage } from './pages/ProductsPage';
import { ProductDetailPage } from './pages/ProductDetailPage';
import { GiftCardsPage } from './pages/GiftCardsPage';
import { CartPage } from './pages/CartPage';
import { CheckoutPage } from './pages/CheckoutPage';

// Routing vitrine R1 — catalogue public réel. Checkout/paiement = placeholders (R2).
export function App() {
  return (
    <Routes>
      <Route element={<PublicLayout />}>
        {/* Catalogue public (R1) */}
        <Route index element={<HomePage />} />
        <Route path="prestations" element={<ServicesPage />} />
        <Route path="prestations/:slug" element={<ServiceDetailPage />} />
        <Route path="formations" element={<TrainingsPage />} />
        <Route path="formations/:id" element={<TrainingDetailPage />} />
        <Route path="produits" element={<ProductsPage />} />
        <Route path="produits/:id" element={<ProductDetailPage />} />
        <Route path="cartes-cadeaux" element={<GiftCardsPage />} />

        {/* Panier + préparation checkout (R2A — panier local, AUCUN paiement) */}
        <Route path="panier" element={<CartPage />} />
        <Route path="checkout" element={<CheckoutPage />} />

        {/* Auth / paiement (placeholders — R2B) */}
        <Route path="connexion" element={<Placeholder title="Connexion" description="Connexion client (R2B+)." />} />
        <Route path="paiement/succes" element={<Placeholder title="Paiement réussi" description="Retour Stripe (R2B)." />} />
        <Route path="paiement/annule" element={<Placeholder title="Paiement annulé" description="Retour Stripe (R2B)." />} />

        <Route path="*" element={<Placeholder title="Page introuvable" description="404." />} />
      </Route>
    </Routes>
  );
}
