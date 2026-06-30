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
import {
  ThemeStudioLayout,
  ThemeStudioDashboard,
  VitrineThemeEditorPage,
  PanelThemeEditorPage,
} from './features/themeStudio';
import { SystemSettingsPage } from './features/systemSettings';
import {
  MailTemplateStudioLayout,
  MailTemplateStudioDashboard,
  MailTemplateEditorPage,
  TemplateVersionsPage,
} from './features/mailTemplates';
import {
  NotificationStudioLayout,
  NotificationTemplateDashboard,
  NotificationTemplateEditorPage,
  NotificationTemplateVersionsPage,
  NotificationCategoriesPage,
} from './features/notificationTemplates';
import { PlanningPage } from './features/planning';
import { ClientsListPage, Customer360Page } from './features/customer360';
import {
  GiftCardTemplateStudioLayout,
  GiftCardTemplateStudioDashboard,
  GiftCardTemplateEditorPage,
  GiftCardTemplateVersionsPage,
} from './features/giftCardTemplates';
import { GiftCardLibraryPage } from './features/giftCardLibrary';
import {
  CatalogueLayout,
  CatalogueDashboard,
  ServicesListPage,
  ServiceEditorPage,
  TrainingsListPage,
  TrainingEditorPage,
  GiftCardCataloguePage,
  ProductsUnavailablePage,
} from './features/catalogue';
import { SessionPresencePage } from './features/learning';
import { ReviewModerationPage } from './features/reviews';
import { FinanceDashboardPage, FinanceTimelinePage } from './features/finance';

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
          {/* M10 — Planning global institut (calendrier unique, mobile-first) */}
          <Route path="planning" element={<PlanningPage />} />
          <Route path="planning/:date" element={<PlanningPage />} />
          {/* M12 — Customer 360 (Client Hub) : recherche + fiche client complète */}
          <Route path="clients" element={<ClientsListPage />} />
          <Route path="clients/:id" element={<Customer360Page />} />
          <Route path="reservations" element={<Placeholder title="Réservations" description="Réservations de prestations." />} />
          {/* C1 — Catalogue Studio (prestations, formations, cartes cadeaux ; produits désactivés) */}
          <Route path="catalogue" element={<CatalogueLayout />}>
            <Route index element={<CatalogueDashboard />} />
            <Route path="prestations" element={<ServicesListPage />} />
            <Route path="prestations/new" element={<ServiceEditorPage />} />
            <Route path="prestations/:id" element={<ServiceEditorPage />} />
            <Route path="formations" element={<TrainingsListPage />} />
            <Route path="formations/new" element={<TrainingEditorPage />} />
            <Route path="formations/:id" element={<TrainingEditorPage />} />
            {/* C2 — Présence d'une session présentielle (scan QR + marquage) */}
            <Route path="formations/:id/sessions/:sessionId/presence" element={<SessionPresencePage />} />
            <Route path="cartes-cadeaux" element={<GiftCardCataloguePage />} />
            <Route path="produits" element={<ProductsUnavailablePage />} />
          </Route>
          {/* M13 — Librairie de templates carte cadeau (admin/dev : sélection de l'actif, sans édition HTML) */}
          <Route path="cartes-cadeaux/templates" element={<GiftCardLibraryPage />} />
          {/* C3 — Modération des avis */}
          <Route path="avis" element={<ReviewModerationPage />} />
          {/* RX2.1 — Finance Dashboard : page d'accueil financière (cards/KPIs/actions, mobile-first) */}
          <Route path="finance" element={<FinanceDashboardPage />} />
          {/* RX2.2 — Financial Timeline : colonne vertébrale narrative (mouvements + résumé filtrable) */}
          <Route path="finance/timeline" element={<FinanceTimelinePage />} />
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
              {/* S1 — Paramètres Système (dev uniquement) : domaines + config métier globale */}
              <Route path="system" element={<SystemSettingsPage />} />
              {/* M6 — Mail Template Studio (dev uniquement) */}
              <Route path="email-templates" element={<MailTemplateStudioLayout />}>
                <Route index element={<MailTemplateStudioDashboard />} />
                <Route path=":templateKey" element={<MailTemplateEditorPage />} />
                <Route path=":templateKey/versions" element={<TemplateVersionsPage />} />
              </Route>

              {/* M13 — Gift Card Template Studio (dev uniquement) */}
              <Route path="gift-card-templates" element={<GiftCardTemplateStudioLayout />}>
                <Route index element={<GiftCardTemplateStudioDashboard />} />
                <Route path=":slug" element={<GiftCardTemplateEditorPage />} />
                <Route path=":slug/versions" element={<GiftCardTemplateVersionsPage />} />
              </Route>

              {/* M7 — Notification Studio (dev uniquement) : templates + catégories */}
              <Route path="notification-templates" element={<NotificationStudioLayout />}>
                <Route index element={<NotificationTemplateDashboard />} />
                <Route path=":templateKey" element={<NotificationTemplateEditorPage />} />
                <Route path=":templateKey/versions" element={<NotificationTemplateVersionsPage />} />
              </Route>
              <Route path="notification-categories" element={<NotificationStudioLayout />}>
                <Route index element={<NotificationCategoriesPage />} />
              </Route>
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

              {/* M5 — Theme Studio (dev uniquement) : 2 thèmes vitrine + panel */}
              <Route path="theme-studio" element={<ThemeStudioLayout />}>
                <Route index element={<ThemeStudioDashboard />} />
                <Route path="vitrine" element={<VitrineThemeEditorPage />} />
                <Route path="panel" element={<PanelThemeEditorPage />} />
              </Route>
            </Route>
          </Route>
        </Route>
      </Route>

      <Route path="*" element={<Placeholder title="Page introuvable" description="404." />} />
    </Routes>
  );
}
