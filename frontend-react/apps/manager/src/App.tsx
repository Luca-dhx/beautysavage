import { Routes, Route } from 'react-router-dom';
import { RequireRole } from '@bs/auth';
import { ManagerLayout } from './layouts/ManagerLayout';
import { DevLayout } from './layouts/DevLayout';
import { Placeholder } from './pages/Placeholder';
import {
  AdminCommunicationLayout,
  DevCommunicationLayout,
  AdminCommunicationDashboard,
  CommercialeIdentityPage,
  AdminMailsPage,
  DevCommunicationDashboard,
  SupportIdentityPage,
  DevMailDeliveriesPage,
  DevSendLogsPage,
} from './features/communication';

// Routing manager R0 — placeholders + guards rôle (cf. rapport 147).
// Manager = admin ou dev. /dev/* = dev uniquement. /login public.
export function App() {
  return (
    <Routes>
      <Route path="/login" element={<Placeholder title="Connexion manager" description="Login manager (admin/dev)." />} />

      <Route element={<RequireRole allow={['admin', 'dev']} loginPath="/login" />}>
        <Route element={<ManagerLayout />}>
          <Route index element={<Placeholder title="Tableau de bord" description="Vue d'ensemble du manager." />} />
          <Route path="onboarding/contrat" element={<Placeholder title="Onboarding — Contrat" description="Activation du contrat." />} />
          <Route path="planning" element={<Placeholder title="Planning" description="Planning des sessions." />} />
          <Route path="reservations" element={<Placeholder title="Réservations" description="Réservations de prestations." />} />
          <Route path="prestations" element={<Placeholder title="Prestations" description="Gestion des prestations." />} />
          <Route path="formations" element={<Placeholder title="Formations" description="Gestion des formations." />} />
          <Route path="produits" element={<Placeholder title="Produits" description="Gestion des produits." />} />
          <Route path="cartes-cadeaux" element={<Placeholder title="Cartes cadeaux" description="Gestion des cartes cadeaux." />} />
          <Route path="ventes" element={<Placeholder title="Ventes" description="Historique des ventes." />} />
          <Route path="remboursements" element={<Placeholder title="Remboursements" description="Gestion des remboursements." />} />
          <Route path="commissions" element={<Placeholder title="Commissions" description="Paiement des commissions." />} />
          <Route path="parametres" element={<Placeholder title="Paramètres" description="Réglages du site." />} />

          {/* M4 — Communication Center (admin/dev autorisés ; vue institut/client) */}
          <Route path="communication" element={<AdminCommunicationLayout />}>
            <Route index element={<AdminCommunicationDashboard />} />
            <Route path="identite-commerciale" element={<CommercialeIdentityPage />} />
            <Route path="mails" element={<AdminMailsPage />} />
          </Route>

          {/* Section dev (RequireRole dev uniquement) */}
          <Route path="dev" element={<RequireRole allow={['dev']} loginPath="/login" deniedPath="/" />}>
            <Route element={<DevLayout />}>
              <Route index element={<Placeholder title="Espace développeur" description="Outils dev." />} />
              <Route path="contrats" element={<Placeholder title="Contrats" description="Gestion des contrats (dev)." />} />
              <Route path="commissions" element={<Placeholder title="Commissions (dev)" description="Config commissions." />} />
              <Route path="integrated-api" element={<Placeholder title="API intégrée" description="Credentials API intégrée." />} />
              <Route path="email-templates" element={<Placeholder title="Templates email" description="Éditeur de templates." />} />
              <Route path="send-logs" element={<Placeholder title="Logs d'envoi" description="Journal des envois." />} />
              <Route path="event-logs" element={<Placeholder title="Logs d'événements" description="Journal des événements." />} />
              <Route path="webhook-failures" element={<Placeholder title="Échecs webhook" description="Webhooks en échec." />} />

              {/* M4 — Communication Center (dev uniquement, vue complète safe) */}
              <Route path="communication" element={<DevCommunicationLayout />}>
                <Route index element={<DevCommunicationDashboard />} />
                <Route path="identite-support" element={<SupportIdentityPage />} />
                <Route path="mail-deliveries" element={<DevMailDeliveriesPage />} />
                <Route path="send-logs" element={<DevSendLogsPage />} />
              </Route>
            </Route>
          </Route>
        </Route>
      </Route>

      <Route path="*" element={<Placeholder title="Page introuvable" description="404." />} />
    </Routes>
  );
}
