import type { CartItemKind, SelectedServiceSlot, SelectedServiceOption } from '@bs/api-client';

// Panier React LOCAL et INDICATIF. Le backend recalcule tout (prix, dispo, lock).
export const CART_VERSION = 1;
export const CART_STORAGE_KEY = 'bs_cart';

export interface CartItemBase {
  /** Identifiant de ligne (unique, généré client). */
  lineId: string;
  kind: CartItemKind;
  refId: string; // serviceId / formationId / productId
  slug?: string;
  name: string;
  /** Prix indicatif (euros) — affichage uniquement, jamais autoritaire. */
  indicativePrice?: number;
}

export interface ServiceCartItem extends CartItemBase {
  kind: 'service';
  /** Créneau choisi (prestation datée). */
  selectedSlot?: SelectedServiceSlot;
  selectedOptions?: SelectedServiceOption[];
}

export type CartItem = ServiceCartItem | CartItemBase;

export interface CartState {
  version: number;
  items: CartItem[];
}

export interface CartSummary {
  count: number;
  /** Total INDICATIF (euros), somme des prix indicatifs. Le backend fait foi. */
  indicativeTotal: number;
}
