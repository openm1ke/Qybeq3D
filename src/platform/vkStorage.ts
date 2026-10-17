import type { KeyValueStore } from './storage'

export interface VKStorageTransport {
  get(keys: string[]): Promise<Record<string, string>>
  set(key: string, value: string): Promise<void>
}

/**
 * Synchronous storage facade for the game with asynchronous VK Storage
 * mirroring. The local copy keeps the game responsive and also lets a first
 * VK launch migrate an existing browser save into the player's VK account.
 */
export class VKStorage implements KeyValueStore {
  private readonly values = new Map<string, string>()
  private hydrated = false
  private pending: Promise<void> = Promise.resolve()
  private readonly transport: VKStorageTransport
  private readonly keys: readonly string[]
  private readonly local: KeyValueStore | null

  constructor(
    transport: VKStorageTransport,
    keys: readonly string[],
    local: KeyValueStore | null,
  ) {
    this.transport = transport
    this.keys = keys
    this.local = local
  }

  async hydrate(): Promise<void> {
    let remote: Record<string, string> = {}
    let remoteAvailable = false
    try {
      remote = await this.transport.get([...this.keys])
      remoteAvailable = true
    } catch {
      /* The local mirror remains a usable offline fallback. */
    }

    const migrate: Array<[string, string]> = []
    for (const key of this.keys) {
      const cloudValue = remote[key]
      if (remoteAvailable && cloudValue) {
        this.values.set(key, cloudValue)
        this.local?.setItem(key, cloudValue)
        continue
      }
      const localValue = this.local?.getItem(key)
      if (localValue != null) {
        this.values.set(key, localValue)
        if (remoteAvailable) migrate.push([key, localValue])
      }
    }
    this.hydrated = true
    for (const [key, value] of migrate) this.queue(key, value)
  }

  getItem(key: string): string | null {
    return this.values.get(key) ?? null
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value)
    this.local?.setItem(key, value)
    if (this.hydrated) this.queue(key, value)
  }

  removeItem(key: string): void {
    this.values.delete(key)
    this.local?.removeItem(key)
    if (this.hydrated) this.queue(key, '')
  }

  flush(): Promise<void> {
    return this.pending
  }

  private queue(key: string, value: string): void {
    this.pending = this.pending
      .catch(() => {})
      .then(() => this.transport.set(key, value))
  }
}
