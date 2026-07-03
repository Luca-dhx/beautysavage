import { lazy, Suspense } from 'react';
import type { ComponentType } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { RequireRole } from '@bs/auth';
import { LoadingState } from '@bs/ui';
import { ManagerLayout } from './layouts/ManagerLayout';
import { ManagerModeGate } from './layouts/ManagerModeGate';
import { DevLayout } from './layouts/DevLayout';
import { Placeholder } from './pages/Placeholder';
import { ComingSoon } from './pages/ComingSoon';
import { ManagerHome } from './pages/ManagerHome';
import { ManagerLoginPage } from './pages/ManagerLoginPage';

// RX-GO-2 — Layouts + accueil + login EAGER ; features chargées à la demande (React.lazy) sous Suspense.
// Réduit le chunk principal manager (~495 KB) : chaque feature dynamique = son propre chunk (partagé entre
// ses leaves via la même URL d'import). Named exports → default.
const l = <T, K extends keyof T>(loader: () => Promise<T>, key: K) =>
  lazy(() => loader().then((m) => ({ default: m[key] as unknown as ComponentType })));

const comm = () => import('./features/communication');
const theme = () => import('./features/themeStudio');
const mailT = () => import('./features/mailTemplates');
const notifT = () => import('./features/notificationTemplates');
const c360 = () => import('./features/customer360');
const gcT = () => import('./features/giftCardTemplates');
const cat = () => import('./features/catalogue');
const fin = () => import('./features/finance');

const AdminCommunicationLayout = l(comm, 'AdminCommunicationLayout');
const DevCommunicationLayout = l(comm, 'DevCommunicationLayout');
const AdminCommunicationDashboard = l(comm, 'AdminCommunicationDashboard');
const CommercialeIdentityPage = l(comm, 'CommercialeIdentityPage');
const AdminMailsPage = l(comm, 'AdminMailsPage');
const DevCommunicationDashboard = l(comm, 'DevCommunicationDashboard');
const SupportIdentityPage = l(comm, 'SupportIdentityPage');
const DevMailDeliveriesPage = l(comm, 'DevMailDeliveriesPage');
const DevSendLogsPage = l(comm, 'DevSendLogsPage');
const ThemeStudioLayout = l(theme, 'ThemeStudioLayout');
const ThemeStudioDashboard = l(theme, 'ThemeStudioDashboard');
const VitrineThemeEditorPage = l(theme, 'VitrineThemeEditorPage');
const PanelThemeEditorPage = l(theme, 'PanelThemeEditorPage');
const SystemSettingsPage = l(() => import('./features/systemSettings'), 'SystemSettingsPage');
const MailTemplateStudioLayout = l(mailT, 'MailTemplateStudioLayout');
const MailTemplateStudioDashboard = l(mailT, 'MailTemplateStudioDashboard');
const MailTemplateEditorPage = l(mailT, 'MailTemplateEditorPage');
const TemplateVersionsPage = l(mailT, 'TemplateVersionsPage');
const NotificationStudioLayout = l(notifT, 'NotificationStudioLayout');
const NotificationTemplateDashboard = l(notifT, 'NotificationTemplateDashboard');
const NotificationTemplateEditorPage = l(notifT, 'NotificationTemplateEditorPage');
const NotificationTemplateVersionsPage = l(notifT, 'NotificationTemplateVersionsPage');
const NotificationCategoriesPage = l(notifT, 'NotificationCategoriesPage');
const PlanningPage = l(() => import('./features/planning'), 'PlanningPage');
const ClientsListPage = l(c360, 'ClientsListPage');
const Customer360Page = l(c360, 'Customer360Page');
const GiftCardTemplateStudioLayout = l(gcT, 'GiftCardTemplateStudioLayout');
const GiftCardTemplateStudioDashboard = l(gcT, 'GiftCardTemplateStudioDashboard');
const GiftCardTemplateEditorPage = l(gcT, 'GiftCardTemplateEditorPage');
const GiftCardTemplateVersionsPage = l(gcT, 'GiftCardTemplateVersionsPage');
const GiftCardLibraryPage = l(() => import('./features/giftCardLibrary'), 'GiftCardLibraryPage');
const CatalogueLayout = l(cat, 'CatalogueLayout');
const CatalogueDashboard = l(cat, 'CatalogueDashboard');
const ServicesListPage = l(cat, 'ServicesListPage');
const ServiceEditorPage = l(cat, 'ServiceEditorPage');
const TrainingsListPage = l(cat, 'TrainingsListPage');
const TrainingEditorPage = l(cat, 'TrainingEditorPage');
const GiftCardCataloguePage = l(cat, 'GiftCardCataloguePage');
const ProductsUnavailablePage = l(cat, 'ProductsUnavailablePage');
const SessionPresencePage = l(() => import('./features/learning'), 'SessionPresencePage');
const ReviewModerationPage = l(() => import('./features/reviews'), 'ReviewModerationPage');
const FinanceDashboardPage = l(fin, 'FinanceDashboardPage');
const FinanceTimelinePage = l(fin, 'FinanceTimelinePage');
const CommissionOverviewPage = l(fin, 'CommissionOverviewPage');
const CommissionDetailPage = l(fin, 'CommissionDetailPage');
const FinanceGiftCardsPage = l(fin, 'FinanceGiftCardsPage');
const GiftCardFinanceDetailPage = l(fin, 'GiftCardFinanceDetailPage');

// Manager = admin ou dev. /dev/* = dev uniquement. /login public.
export function App() {
  return (
    <Suspense fallback={<LoadingState label="Chargement…" />}>
      <Routes>
        <Route path="/login" element={<ManagerLoginPage />} />

        <Route element={<RequireRole allow={['admin', 'dev']} loginPath="/login" />}>
          {/* RX-BLOCKER — bascule idempotente en mode gestion avant tout rendu (sinon /api/gestion/* 302 → KO). */}
          <Route element={<ManagerModeGate />}>
          <Route element={<ManagerLayout />}>
            {/* RX-GO-2 — vrai tableau de bord (hub), plus de placeholder vide */}
            <Route index element={<ManagerHome />} />
            <Route path="onboarding/contrat" element={<ComingSoon title="Onboarding — Contrat" description="L’activation du contrat se fait via l’assistant d’onboarding." links={[{ to: '/finance', label: 'Finance' }]} />} />
            {/* M10 — Planning global institut */}
            <Route path="planning" element={<PlanningPage />} />
            <Route path="planning/:date" element={<PlanningPage />} />
            {/* M12 — Customer 360 */}
            <Route path="clients" element={<ClientsListPage />} />
            <Route path="clients/:id" element={<Customer360Page />} />
            {/* RX-GO-2 — routes historiques subsumées → redirections utiles */}
            <Route path="reservations" element={<Navigate to="/planning" replace />} />
            <Route path="ventes" element={<Navigate to="/finance/timeline" replace />} />
            <Route path="remboursements" element={<Navigate to="/finance" replace />} />
            <Route path="commissions" element={<Navigate to="/finance/commissions" replace />} />
            <Route path="parametres" element={<ComingSoon title="Paramètres" description="La configuration système (domaines, identité, taxes) est disponible dans l’espace développeur." links={[{ to: '/dev/system', label: 'Paramètres système (dev)' }]} />} />
            {/* C1 — Catalogue Studio */}
            <Route path="catalogue" element={<CatalogueLayout />}>
              <Route index element={<CatalogueDashboard />} />
              <Route path="prestations" element={<ServicesListPage />} />
              <Route path="prestations/new" element={<ServiceEditorPage />} />
              <Route path="prestations/:id" element={<ServiceEditorPage />} />
              <Route path="formations" element={<TrainingsListPage />} />
              <Route path="formations/new" element={<TrainingEditorPage />} />
              <Route path="formations/:id" element={<TrainingEditorPage />} />
              <Route path="formations/:id/sessions/:sessionId/presence" element={<SessionPresencePage />} />
              <Route path="cartes-cadeaux" element={<GiftCardCataloguePage />} />
              <Route path="produits" element={<ProductsUnavailablePage />} />
            </Route>
            <Route path="cartes-cadeaux/templates" element={<GiftCardLibraryPage />} />
            <Route path="avis" element={<ReviewModerationPage />} />
            {/* RX2 — Finance */}
            <Route path="finance" element={<FinanceDashboardPage />} />
            <Route path="finance/timeline" element={<FinanceTimelinePage />} />
            <Route path="finance/commissions" element={<CommissionOverviewPage />} />
            <Route path="finance/commissions/:year/:month" element={<CommissionDetailPage />} />
            <Route path="finance/cartes-cadeaux" element={<FinanceGiftCardsPage />} />
            <Route path="finance/cartes-cadeaux/:giftCardId" element={<GiftCardFinanceDetailPage />} />

            {/* M4 — Communication Center */}
            <Route path="communication" element={<AdminCommunicationLayout />}>
              <Route index element={<AdminCommunicationDashboard />} />
              <Route path="identite-commerciale" element={<CommercialeIdentityPage />} />
              <Route path="mails" element={<AdminMailsPage />} />
            </Route>

            {/* Section dev (RequireRole dev uniquement) */}
            <Route path="dev" element={<RequireRole allow={['dev']} loginPath="/login" deniedPath="/" />}>
              <Route element={<DevLayout />}>
                <Route index element={<ComingSoon title="Espace développeur" description="Outils techniques et studios de contenu." links={[{ to: '/dev/system', label: 'Paramètres système' }, { to: '/dev/theme-studio', label: 'Theme Studio' }, { to: '/dev/email-templates', label: 'Templates e-mail' }, { to: '/dev/communication', label: 'Communication / journaux' }]} />} />
                <Route path="contrats" element={<ComingSoon title="Contrats" description="La gestion des contrats arrive prochainement." links={[{ to: '/dev/system', label: 'Paramètres système' }]} />} />
                <Route path="commissions" element={<ComingSoon title="Commissions (dev)" description="La configuration des commissions arrive prochainement." links={[{ to: '/finance/commissions', label: 'Commissions (finance)' }]} />} />
                <Route path="integrated-api" element={<ComingSoon title="API intégrée" description="La gestion des credentials d’API intégrée arrive prochainement." links={[{ to: '/dev/system', label: 'Paramètres système' }]} />} />
                <Route path="system" element={<SystemSettingsPage />} />
                {/* M6 — Mail Template Studio */}
                <Route path="email-templates" element={<MailTemplateStudioLayout />}>
                  <Route index element={<MailTemplateStudioDashboard />} />
                  <Route path=":templateKey" element={<MailTemplateEditorPage />} />
                  <Route path=":templateKey/versions" element={<TemplateVersionsPage />} />
                </Route>
                {/* M13 — Gift Card Template Studio */}
                <Route path="gift-card-templates" element={<GiftCardTemplateStudioLayout />}>
                  <Route index element={<GiftCardTemplateStudioDashboard />} />
                  <Route path=":slug" element={<GiftCardTemplateEditorPage />} />
                  <Route path=":slug/versions" element={<GiftCardTemplateVersionsPage />} />
                </Route>
                {/* M7 — Notification Studio */}
                <Route path="notification-templates" element={<NotificationStudioLayout />}>
                  <Route index element={<NotificationTemplateDashboard />} />
                  <Route path=":templateKey" element={<NotificationTemplateEditorPage />} />
                  <Route path=":templateKey/versions" element={<NotificationTemplateVersionsPage />} />
                </Route>
                <Route path="notification-categories" element={<NotificationStudioLayout />}>
                  <Route index element={<NotificationCategoriesPage />} />
                </Route>
                {/* RX-GO-2 — journaux : send-logs redirige vers la page implémentée */}
                <Route path="send-logs" element={<Navigate to="/dev/communication/send-logs" replace />} />
                <Route path="event-logs" element={<ComingSoon title="Logs d’événements" description="Le journal des événements arrive prochainement." links={[{ to: '/dev/communication/mail-deliveries', label: 'Suivi des e-mails' }]} />} />
                <Route path="webhook-failures" element={<ComingSoon title="Échecs webhook" description="Le suivi des webhooks en échec arrive prochainement." links={[{ to: '/dev/communication/send-logs', label: 'Journal des envois' }]} />} />

                {/* M4 — Communication Center (dev) */}
                <Route path="communication" element={<DevCommunicationLayout />}>
                  <Route index element={<DevCommunicationDashboard />} />
                  <Route path="identite-support" element={<SupportIdentityPage />} />
                  <Route path="mail-deliveries" element={<DevMailDeliveriesPage />} />
                  <Route path="send-logs" element={<DevSendLogsPage />} />
                </Route>

                {/* M5 — Theme Studio */}
                <Route path="theme-studio" element={<ThemeStudioLayout />}>
                  <Route index element={<ThemeStudioDashboard />} />
                  <Route path="vitrine" element={<VitrineThemeEditorPage />} />
                  <Route path="panel" element={<PanelThemeEditorPage />} />
                </Route>
              </Route>
            </Route>
          </Route>
          </Route>
        </Route>

        <Route path="*" element={<Placeholder title="Page introuvable" description="404." />} />
      </Routes>
    </Suspense>
  );
}
