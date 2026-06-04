import { describe, it, expect, beforeEach } from "vitest";
import { Cache } from "../utils/cacheStore";

describe("CacheStore", () => {
  let store: ReturnType<typeof Cache.getStore<string, number>>;

  beforeEach(() => {
    store = Cache.getStore<string, number>("test", { max: 3, ttlMs: 60000 });
    store.clear();
  });

  it("set and get values", () => {
    store.set("a", 1);
    expect(store.get("a")).toBe(1);
  });

  it("returns undefined for missing key", () => {
    expect(store.get("missing")).toBeUndefined();
  });

  it("deletes a key", () => {
    store.set("a", 1);
    expect(store.delete("a")).toBe(true);
    expect(store.get("a")).toBeUndefined();
  });

  it("clear removes all entries", () => {
    store.set("a", 1);
    store.set("b", 2);
    store.clear();
    expect(store.size()).toBe(0);
  });

  it("evicts oldest when over max", () => {
    store.set("a", 1);
    store.set("b", 2);
    store.set("c", 3);
    store.set("d", 4);
    expect(store.size()).toBe(3);
    expect(store.get("a")).toBeUndefined();
  });

  it("has returns correct state", () => {
    store.set("a", 1);
    expect(store.has("a")).toBe(true);
    expect(store.has("b")).toBe(false);
  });

  it("uses validate function to reject stale values on get/has", () => {
    const validating = Cache.getStore<string, number>("validating", {
      max: 10,
      ttlMs: 60000,
      validate: (v) => v > 0,
    });
    validating.clear();

    validating.set("a", 1);
    expect(validating.get("a")).toBe(1);

    validating.set("b", -1);
    expect(validating.get("b")).toBeUndefined();
    expect(validating.has("b")).toBe(false);
  });

  it("getStats returns correct info", () => {
    store.set("a", 1);
    const stats = store.getStats();
    expect(stats.size).toBe(1);
    expect(stats.max).toBe(3);
    expect(stats.ttlMs).toBe(60000);
  });
});
