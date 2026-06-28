import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { ServiceCartItem, CartItem, CartSummary } from './cartTypes';
import { loadCart, saveCart, newLineId } from './cartStorage';

export interface CartContextValue {
  items: CartItem[];
  summary: CartSummary;
  addService: (item: Omit<ServiceCartItem, 'lineId' | 'kind'>) => string;
  removeItem: (lineId: string) => void;
  updateItem: (lineId: string, patch: Partial<CartItem>) => void;
  clearCart: () => void;
}

const CartContext = createContext<CartContextValue | null>(null);

export interface CartProviderProps {
  children: ReactNode;
  /** État initial injectable (tests). Défaut : localStorage. */
  initialItems?: CartItem[];
}

export function CartProvider({ children, initialItems }: CartProviderProps) {
  const [items, setItems] = useState<CartItem[]>(() => initialItems ?? loadCart());

  useEffect(() => {
    saveCart(items);
  }, [items]);

  const addService = useCallback((item: Omit<ServiceCartItem, 'lineId' | 'kind'>) => {
    const lineId = newLineId();
    setItems((prev) => [...prev, { ...item, kind: 'service', lineId }]);
    return lineId;
  }, []);

  const removeItem = useCallback((lineId: string) => {
    setItems((prev) => prev.filter((it) => it.lineId !== lineId));
  }, []);

  const updateItem = useCallback((lineId: string, patch: Partial<CartItem>) => {
    setItems((prev) => prev.map((it) => (it.lineId === lineId ? ({ ...it, ...patch } as CartItem) : it)));
  }, []);

  const clearCart = useCallback(() => setItems([]), []);

  const summary = useMemo<CartSummary>(
    () => ({
      count: items.length,
      indicativeTotal: items.reduce((sum, it) => sum + (it.indicativePrice ?? 0), 0),
    }),
    [items],
  );

  const value = useMemo<CartContextValue>(
    () => ({ items, summary, addService, removeItem, updateItem, clearCart }),
    [items, summary, addService, removeItem, updateItem, clearCart],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartContextValue {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart doit être utilisé dans <CartProvider>.');
  return ctx;
}
