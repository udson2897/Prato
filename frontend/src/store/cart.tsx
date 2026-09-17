import React, { createContext, useContext, useState, useCallback } from 'react';

export type CartLine = {
  key: string; // unique per product configuration
  product_id: string;
  name: string;
  base_price: number;
  unit_price: number; // base + variation deltas + addons
  image_url?: string;
  quantity: number;
  options_label: string;
  variations: Record<string, string>;
  addons: string[];
};

export type ConfiguredItem = {
  product_id: string;
  name: string;
  base_price: number;
  unit_price: number;
  image_url?: string;
  options_label: string;
  variations: Record<string, string>;
  addons: string[];
};

function lineKey(item: ConfiguredItem) {
  return `${item.product_id}|${JSON.stringify(item.variations)}|${item.addons.slice().sort().join(',')}`;
}

type CartCtx = {
  storeId: string | null;
  storeName: string | null;
  lines: CartLine[];
  addConfigured: (storeId: string, storeName: string, item: ConfiguredItem) => void;
  incItem: (key: string) => void;
  decItem: (key: string) => void;
  removeItem: (key: string) => void;
  clear: () => void;
  subtotal: number;
  count: number;
};

const Ctx = createContext<CartCtx | null>(null);

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [storeId, setStoreId] = useState<string | null>(null);
  const [storeName, setStoreName] = useState<string | null>(null);
  const [lines, setLines] = useState<CartLine[]>([]);

  const clear = useCallback(() => {
    setLines([]);
    setStoreId(null);
    setStoreName(null);
  }, []);

  const addConfigured = (sid: string, sname: string, item: ConfiguredItem) => {
    setStoreId(sid);
    setStoreName(sname);
    const key = lineKey(item);
    setLines((prev) => {
      const idx = prev.findIndex((l) => l.key === key);
      if (idx >= 0) {
        const copy = [...prev];
        copy[idx] = { ...copy[idx], quantity: copy[idx].quantity + 1 };
        return copy;
      }
      return [...prev, { ...item, key, quantity: 1 }];
    });
  };

  const incItem = (key: string) =>
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, quantity: l.quantity + 1 } : l)));
  const decItem = (key: string) =>
    setLines((prev) =>
      prev.map((l) => (l.key === key ? { ...l, quantity: l.quantity - 1 } : l)).filter((l) => l.quantity > 0),
    );
  const removeItem = (key: string) => setLines((prev) => prev.filter((l) => l.key !== key));

  const subtotal = lines.reduce((sum, l) => sum + l.unit_price * l.quantity, 0);
  const count = lines.reduce((sum, l) => sum + l.quantity, 0);

  return (
    <Ctx.Provider
      value={{ storeId, storeName, lines, addConfigured, incItem, decItem, removeItem, clear, subtotal, count }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useCart() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useCart within CartProvider');
  return v;
}
