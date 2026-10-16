import test, { describe } from "node:test";
import assert from "node:assert/strict";
import {
  clearQueryCache,
  configureQueryCacheStorage,
  queryCacheKey,
  readQueryCache,
  setQueryCacheScope,
  writeQueryCache
} from "../core/hooks/query-cache";

function memoryStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, value),
    removeItem: (key: string) => void map.delete(key),
    key: (index: number) => [...map.keys()][index] ?? null,
    get length() {
      return map.size;
    }
  };
}

describe("Query cache", () => {
  test("returns the last result for the same query, and nothing for a different one", () => {
    clearQueryCache();
    setQueryCacheScope("user-1:tenant-1");
    const key = queryCacheKey(["select users", ["tenant-1"]]);
    writeQueryCache(key, [{ id: 1 }]);
    assert.deepEqual(readQueryCache(key), [{ id: 1 }]);
    assert.equal(readQueryCache(queryCacheKey(["select users", ["tenant-2"]])), null);
  });

  test("never shows one user's or workspace's data to another", () => {
    clearQueryCache();
    const key = queryCacheKey(["select orders", []]);
    setQueryCacheScope("user-1:tenant-1");
    writeQueryCache(key, [{ order: "A" }]);
    setQueryCacheScope("user-2:tenant-1");
    assert.equal(readQueryCache(key), null);
    setQueryCacheScope("user-1:tenant-2");
    assert.equal(readQueryCache(key), null);
  });

  test("survives a reload through storage, and sign-out clears everything", () => {
    const storage = memoryStorage();
    configureQueryCacheStorage(storage);
    clearQueryCache();
    setQueryCacheScope("user-1:tenant-1");
    const key = queryCacheKey(["select notes", []]);
    writeQueryCache(key, [{ note: "hi" }]);
    assert.equal(storage.length, 1);

    clearQueryCache();
    assert.equal(readQueryCache(key), null);
    assert.equal(storage.length, 0);
    configureQueryCacheStorage(null);
  });

  test("a query whose inputs cannot be serialised is simply not cached", () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    assert.equal(queryCacheKey([circular]), null);
    writeQueryCache(null, [1]);
    assert.equal(readQueryCache(null), null);
  });
});
