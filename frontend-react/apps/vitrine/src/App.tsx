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
import { PaymentSuccessPage } from './pages/PaymentSuccessPage';
import { PaymentCancelPage } from './pages/PaymentCancelPage';
import { LoginPage } from './pages/LoginPage';
import { MyFormationsPage } from './pages/MyFormationsPage';
import { FormationPlayerPage } from './pages/FormationPlayerPage';
import { MyAccountPage } from './pages/MyAccountPage';

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

        {/* Retour paiement (R2B) */}
        <Route path="paiement/succes" element={<PaymentSuccessPage />} />
        <Route path="paiement/annule" element={<PaymentCancelPage />} />

        {/* Login client léger (R2C) */}
        <Route path="connexion" element={<LoginPage />} />

        {/* C2 — Learning : espace apprenant (formations distancielles acquises) */}
        <Route path="mes-formations" element={<MyFormationsPage />} />
        <Route path="mes-formations/:id" element={<FormationPlayerPage />} />
        {/* RX1 — Espace compte client (hub + déconnexion) */}
        <Route path="mon-compte" element={<MyAccountPage />} />

        <Route path="*" element={<Placeholder title="Page introuvable" description="404." />} />
      </Route>
    </Routes>
  );
}
