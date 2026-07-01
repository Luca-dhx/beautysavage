// RX4 — Hooks données de l'espace client (TanStack Query). Lecture partagée par le dashboard et les
// sous-pages : le cache évite les refetch entre écrans du hub.
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  listMyBookings,
  listMyGiftCards,
  getMyGiftCard,
  listMySales,
  updateMyProfile,
} from '@bs/api-client';

const STALE = 30_000;

export function useMyBookings() {
  return useQuery({
    queryKey: ['account', 'bookings'],
    queryFn: ({ signal }) => listMyBookings(signal),
    staleTime: STALE,
    retry: false,
  });
}

export function useMyGiftCards() {
  return useQuery({
    queryKey: ['account', 'gift-cards'],
    queryFn: ({ signal }) => listMyGiftCards(signal),
    staleTime: STALE,
    retry: false,
  });
}

export function useMyGiftCard(cardId: string | undefined) {
  return useQuery({
    queryKey: ['account', 'gift-card', cardId],
    queryFn: () => getMyGiftCard(cardId as string),
    enabled: Boolean(cardId),
    staleTime: STALE,
    retry: false,
  });
}

export function useMySales() {
  return useQuery({
    queryKey: ['account', 'sales'],
    queryFn: ({ signal }) => listMySales(signal),
    staleTime: STALE,
    retry: false,
  });
}

// Prénom édité en session (audit §0.1 : /auth/me ne l'expose pas). Persisté localement pour l'accueil.
const FIRST_NAME_KEY = 'bs.account.firstName';

export function readStoredFirstName(): string {
  try {
    return localStorage.getItem(FIRST_NAME_KEY) || '';
  } catch {
    return '';
  }
}

function writeStoredFirstName(value: string): void {
  try {
    if (value) localStorage.setItem(FIRST_NAME_KEY, value);
    else localStorage.removeItem(FIRST_NAME_KEY);
  } catch {
    /* stockage indisponible : accueil retombe sur l'e-mail */
  }
}

export function useUpdateProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { firstName?: string; lastName?: string }) => updateMyProfile(input),
    onSuccess: (profile) => {
      writeStoredFirstName(profile.firstName);
      qc.setQueryData(['account', 'profile'], profile);
    },
  });
}
