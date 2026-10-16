import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { getQueryCacheScope } from "./query-cache";
import type { CatalogItem, PriceCatalog } from "../gateway/shop-gateway";
import type { BackendResult } from "../types/contracts";

/**
 * The customer catalog and cart. The catalog (thousands of items) is kept on the device so
 * the shop opens instantly and refreshes in the background; the cart survives reloads and
 * app restarts. Both are namespaced by the signed-in user + workspace.
 */

type AsyncStorageLike = {
  getItem: (key: string) => Promise<string | null> | string | null;
  setItem: (key: string, value: string) => Promise<void> | void;
};

let storage: AsyncStorageLike | null = null;

export function configureShopStorage(next: AsyncStorageLike | null) {
  storage = next;
}

async function readStored<T>(key: string): Promise<T | null> {
  try {
    const raw = await storage?.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

async function writeStored(key: string, value: unknown) {
  try {
    await storage?.setItem(key, JSON.stringify(value));
  } catch {
    // Quota exceeded or storage blocked: the in-memory copy still works.
  }
}

// ---- Catalog ----

const CATALOG_FRESH_MS = 60_000;
const catalogs = new Map<string, { data: PriceCatalog; at: number }>();
const catalogRequests = new Map<string, Promise<BackendResult<PriceCatalog>>>();

export function useCatalog(fetcher: () => Promise<BackendResult<PriceCatalog>>) {
  const scope = getQueryCacheScope();
  const storageKey = `shop1:catalog:${scope}`;
  const [data, setData] = useState<PriceCatalog | null>(() => catalogs.get(scope)?.data ?? null);
  const [loading, setLoading] = useState(!catalogs.has(scope));
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(
    async (force = true) => {
      const cached = catalogs.get(scope);
      if (!force && cached && Date.now() - cached.at < CATALOG_FRESH_MS) return;
      setRefreshing(true);
      // Screens opened at the same time share one request.
      let request = catalogRequests.get(scope);
      if (!request) {
        request = fetcher().finally(() => catalogRequests.delete(scope));
        catalogRequests.set(scope, request);
      }
      const result = await request;
      setRefreshing(false);
      setLoading(false);
      if (result.data) {
        catalogs.set(scope, { data: result.data, at: Date.now() });
        setData(result.data);
        setError(null);
        void writeStored(storageKey, result.data);
      } else {
        setError(result.error ?? "The catalogue could not be loaded.");
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [scope, storageKey]
  );

  useEffect(() => {
    let active = true;
    void (async () => {
      if (!catalogs.has(scope)) {
        const stored = await readStored<PriceCatalog>(storageKey);
        if (active && stored && !catalogs.has(scope)) {
          catalogs.set(scope, { data: stored, at: 0 });
          setData(stored);
          setLoading(false);
        }
      }
      if (active) await refresh(false);
    })();
    return () => {
      active = false;
    };
  }, [scope, storageKey, refresh]);

  return { data, loading: loading && !data, refreshing, error, refresh };
}

// ---- Cart ----

export type CartLine = Pick<CatalogItem, "key" | "name" | "category" | "brand"> & { quantity: number };

const carts = new Map<string, CartLine[]>();
const cartListeners = new Set<() => void>();
const loadedCarts = new Set<string>();
const EMPTY: CartLine[] = [];

function cartKey(scope: string) {
  return `shop1:cart:${scope}`;
}

function setCart(scope: string, lines: CartLine[]) {
  carts.set(scope, lines);
  cartListeners.forEach((listener) => listener());
  void writeStored(cartKey(scope), lines);
}

function subscribeCart(listener: () => void) {
  cartListeners.add(listener);
  return () => {
    cartListeners.delete(listener);
  };
}

export function useCart() {
  const scope = getQueryCacheScope();
  const lines = useSyncExternalStore(subscribeCart, () => carts.get(scope) ?? EMPTY, () => EMPTY);

  useEffect(() => {
    if (loadedCarts.has(scope)) return;
    loadedCarts.add(scope);
    void readStored<CartLine[]>(cartKey(scope)).then((stored) => {
      if (stored?.length && !(carts.get(scope)?.length)) {
        carts.set(scope, stored);
        cartListeners.forEach((listener) => listener());
      }
    });
  }, [scope]);

  const current = () => carts.get(scope) ?? [];
  const setQuantity = useCallback(
    (item: Pick<CatalogItem, "key" | "name" | "category" | "brand">, quantity: number) => {
      const next = Math.max(0, Math.min(10_000, Math.floor(quantity) || 0));
      const others = current().filter((line) => line.key !== item.key);
      const existing = current().find((line) => line.key === item.key);
      if (!next) return setCart(scope, others);
      const line = { key: item.key, name: item.name, category: item.category, brand: item.brand, quantity: next };
      // Keep the line where it was when changing its quantity; new lines go last.
      setCart(scope, existing ? current().map((row) => (row.key === item.key ? line : row)) : [...others, line]);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [scope]
  );
  const clear = useCallback(() => setCart(scope, []), [scope]);
  const remove = useCallback((key: string) => setCart(scope, current().filter((line) => line.key !== key)), [scope]); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    lines,
    count: lines.length,
    totalQuantity: lines.reduce((sum, line) => sum + line.quantity, 0),
    quantityOf: (key: string) => lines.find((line) => line.key === key)?.quantity ?? 0,
    setQuantity,
    remove,
    clear
  };
}
