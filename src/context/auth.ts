const contextKeyMap = new Map<symbol, any>();

export function createContextKey<T>(defaultValue: T): symbol {
  const key = Symbol();
  contextKeyMap.set(key, defaultValue);
  return key;
}

export function getContextValue<T>(map: Map<symbol, any>, key: symbol): T {
  return map.get(key) as T;
}

export function setContextValue<T>(map: Map<symbol, any>, key: symbol, value: T): void {
  map.set(key, value);
}

export const apiKeyContextKey = createContextKey<string | null>(null);
