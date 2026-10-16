/**
 * Small stale-while-revalidate cache for list queries. A screen shows the last result for
 * the same query at once and refreshes it in the background, so moving between pages does
 * not wait on the network again (each Supabase/API round trip costs 0.3-1s from India).
 *
 * Entries are namespaced by a scope (signed-in user + workspace) and cleared on sign-out,
 * so data never carries over between accounts or workspaces.
 */

type Entry = { data: unknown[]; at: number };
type KeyValueStorage = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
  key?: (index: number) => string | null;
  readonly length?: number;
};

const PREFIX = "qc1:";
const MAX_PERSISTED_CHARS = 400_000;

const memory = new Map<string, Entry>();
let scope = "anon";
let storage: KeyValueStorage | null = null;

/** Optional synchronous storage (e.g. sessionStorage) so a page reload also starts from cache. */
export function configureQueryCacheStorage(next: KeyValueStorage | null) {
  storage = next;
}

export function setQueryCacheScope(next: string) {
  scope = next || "anon";
}

export function clearQueryCache() {
  memory.clear();
  if (!storage?.key || storage.length === undefined) return;
  try {
    const keys: string[] = [];
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index);
      if (key?.startsWith(PREFIX)) keys.push(key);
    }
    keys.forEach((key) => storage?.removeItem(key));
  } catch {
    // Storage unavailable (private mode, quota): memory is already cleared.
  }
}

function hash(value: string) {
  let h = 5381;
  for (let index = 0; index < value.length; index += 1) h = ((h << 5) + h + value.charCodeAt(index)) | 0;
  return (h >>> 0).toString(36);
}

/** Builds a cache key from the query's identity, or null when it cannot be serialised. */
export function queryCacheKey(parts: unknown[]) {
  try {
    return hash(JSON.stringify(parts));
  } catch {
    return null;
  }
}

export function readQueryCache<T>(key: string | null): T[] | null {
  if (!key) return null;
  const fullKey = `${PREFIX}${scope}:${key}`;
  const cached = memory.get(fullKey);
  if (cached) return cached.data as T[];
  if (!storage) return null;
  try {
    const raw = storage.getItem(fullKey);
    if (!raw) return null;
    const entry = JSON.parse(raw) as Entry;
    memory.set(fullKey, entry);
    return entry.data as T[];
  } catch {
    return null;
  }
}

export function writeQueryCache(key: string | null, data: unknown[]) {
  if (!key) return;
  const fullKey = `${PREFIX}${scope}:${key}`;
  const entry: Entry = { data, at: Date.now() };
  memory.set(fullKey, entry);
  if (!storage) return;
  try {
    const raw = JSON.stringify(entry);
    if (raw.length <= MAX_PERSISTED_CHARS) storage.setItem(fullKey, raw);
  } catch {
    // Quota exceeded or storage blocked: the in-memory copy still works.
  }
}

// In-flight request tracking, for a subtle "refreshing" indicator.
let inFlight = 0;
const listeners = new Set<(busy: boolean) => void>();

function notify() {
  const busy = inFlight > 0;
  listeners.forEach((listener) => listener(busy));
}

export async function trackQuery<T>(promise: Promise<T>): Promise<T> {
  inFlight += 1;
  notify();
  try {
    return await promise;
  } finally {
    inFlight -= 1;
    notify();
  }
}

export function subscribeQueryActivity(listener: (busy: boolean) => void) {
  listeners.add(listener);
  listener(inFlight > 0);
  return () => {
    listeners.delete(listener);
  };
}
