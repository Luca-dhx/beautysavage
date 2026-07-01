import { Accordion, type AccordionItemData } from '@bs/ui';
import { formatDuration, type PublicService } from '@bs/api-client';

// RX3 — FAQ prestation dérivée UNIQUEMENT de données backend réelles (paiement, durée, capacité,
// confirmation créneau). Aucune réponse inventée : si la donnée n'existe pas, la question n'apparaît pas.

function buildFaq(service: PublicService): AccordionItemData[] {
  const items: AccordionItemData[] = [];

  if (service.paymentType === 'deposit') {
    items.push({
      id: 'payment',
      title: 'Dois-je tout payer en réservant ?',
      content: 'Un acompte est demandé à la réservation ; le solde se règle sur place.',
    });
  } else if (service.paymentType === 'free') {
    items.push({ id: 'payment', title: 'Cette réservation est-elle payante ?', content: 'Non, la réservation est gratuite.' });
  } else {
    items.push({ id: 'payment', title: 'Quand s’effectue le paiement ?', content: 'Le paiement s’effectue en ligne au moment de la réservation.' });
  }

  items.push({
    id: 'confirm',
    title: 'Mon créneau est-il réservé immédiatement ?',
    content: 'Le créneau choisi est confirmé après le paiement (ou la validation). Avant cela, il n’est pas bloqué.',
  });

  if (service.duration) {
    items.push({ id: 'duration', title: 'Combien de temps dure la prestation ?', content: `Elle dure environ ${formatDuration(service.duration)}.` });
  }
  if (service.capacity && service.capacity > 1) {
    items.push({ id: 'capacity', title: 'Puis-je venir accompagné(e) ?', content: `Cette prestation peut accueillir jusqu’à ${service.capacity} personnes.` });
  }
  return items;
}

export function ServiceFaq({ service }: { service: PublicService }) {
  const items = buildFaq(service);
  if (!items.length) return null;
  return (
    <section className="sd-section" aria-label="Questions fréquentes">
      <h2 className="sd-section__title">Questions fréquentes</h2>
      <Accordion items={items} defaultOpen={[items[0].id]} />
    </section>
  );
}
