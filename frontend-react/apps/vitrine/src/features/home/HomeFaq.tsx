import { Accordion, SectionHeader } from '@bs/ui';

// RX3 S4 — FAQ d'accueil. Questions métier réelles, réponses véridiques (dérivées du fonctionnement réel :
// confirmation après paiement, distanciel accès à vie, présentiel sur session, cartes cadeaux). Accordion partagé.

const FAQ = [
  {
    id: 'reserver',
    title: 'Comment réserver une prestation ?',
    content: 'Choisissez une prestation, sélectionnez un créneau disponible, puis payez en ligne. Le créneau est confirmé après le paiement.',
  },
  {
    id: 'formations',
    title: 'Quelle différence entre formation en ligne et présentiel ?',
    content: 'Les formations en ligne offrent un accès à vie au contenu, à votre rythme. Les formations présentielles se déroulent sur une session datée, avec un nombre de places limité.',
  },
  {
    id: 'paiement',
    title: 'Le paiement est-il sécurisé ?',
    content: 'Oui. Le paiement s’effectue via Stripe (page sécurisée) ; aucune donnée bancaire ne transite par le site.',
  },
  {
    id: 'carte',
    title: 'Comment fonctionne une carte cadeau ?',
    content: 'Choisissez un montant, ajoutez un mot pour le bénéficiaire, puis réglez. La carte est utilisable sur nos prestations et formations, selon les conditions de l’institut.',
  },
];

export function HomeFaq() {
  return (
    <section className="home-section" aria-label="Questions fréquentes">
      <SectionHeader title="Questions fréquentes" />
      <Accordion items={FAQ} defaultOpen={[FAQ[0].id]} />
    </section>
  );
}
