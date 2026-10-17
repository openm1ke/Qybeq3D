/**
 * Key-value storage for everything the game keeps between visits. It is
 * the browser's localStorage unless a platform supplies its own (Yandex
 * Games' safe storage survives iOS clearing site data). Every call is
 * guarded: storage is optional and the game plays without it.
 */
export interface KeyValueStore {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

let backend: KeyValueStore | null = null

/** Replaces localStorage; called once, before the game renders. */
export function setStorageBackend(store: KeyValueStore | null): void {
  backend = store
}

function current(): KeyValueStore {
  return backend ?? globalThis.localStorage
}

export const storage: KeyValueStore = {
  getItem(key) {
    try {
      return current().getItem(key)
    } catch {
      return null
    }
  },
  setItem(key, value) {
    try {
      current().setItem(key, value)
    } catch {
      /* Optional storage. */
    }
  },
  removeItem(key) {
    try {
      current().removeItem(key)
    } catch {
      /* Optional storage. */
    }
  },
}
