// RX3 — Tests de l'Accordion partagé (aria-expanded, region, ouverture unique par défaut).
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Accordion } from './index';

const ITEMS = [
  { id: 'a', title: 'Question A', content: 'Réponse A' },
  { id: 'b', title: 'Question B', content: 'Réponse B' },
];

describe('Accordion', () => {
  it('ouvre/ferme un panneau et expose aria-expanded + region', () => {
    render(<Accordion items={ITEMS} />);
    const btnA = screen.getByRole('button', { name: 'Question A' });
    expect(btnA).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('Réponse A')).toBeNull();

    fireEvent.click(btnA);
    expect(btnA).toHaveAttribute('aria-expanded', 'true');
    const region = screen.getByRole('region', { name: 'Question A' });
    expect(region).toHaveTextContent('Réponse A');

    fireEvent.click(btnA);
    expect(screen.queryByText('Réponse A')).toBeNull();
  });

  it('mode simple : ouvrir B ferme A', () => {
    render(<Accordion items={ITEMS} defaultOpen={['a']} />);
    expect(screen.getByText('Réponse A')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Question B' }));
    expect(screen.getByText('Réponse B')).toBeInTheDocument();
    expect(screen.queryByText('Réponse A')).toBeNull();
  });

  it('mode multiple : A et B peuvent être ouverts ensemble', () => {
    render(<Accordion items={ITEMS} multiple defaultOpen={['a']} />);
    fireEvent.click(screen.getByRole('button', { name: 'Question B' }));
    expect(screen.getByText('Réponse A')).toBeInTheDocument();
    expect(screen.getByText('Réponse B')).toBeInTheDocument();
  });
});
