/**
 * What the game needs from the place it runs in. The web build (GitHub
 * Pages) and the Yandex Games build differ only here; screens never talk to
 * an SDK directly.
 */

/** How one rewarded video ended (mobile `AdResult`). */
export type RewardedResult = 'rewarded' | 'dismissed' | 'unavailable' | 'failed'

export interface Platform {
  readonly id: 'web' | 'yandex' | 'vk'
  /** Starts the platform; the game renders once this settles. */
  init(): Promise<void>
  /** The player's language as the platform reports it (ISO 639-1). */
  detectedLanguage(): string | null
  /** The game can be played: the first screen is interactive. */
  ready(): void
  /**
   * Whether a puzzle is being played right now. Reported on every change;
   * the platform itself accounts for hidden tabs and its own pauses.
   */
  setGameplayActive(active: boolean): void
  /** The platform paused the game (ads, dialogs, tab switch) or resumed it. */
  onPauseChange(listener: (paused: boolean) => void): () => void
  readonly paused: boolean
  /** Rewarded videos can be offered. */
  readonly rewardedAds: boolean
  /**
   * Shows one rewarded video. [onRewarded] fires at most once, only when
   * the platform confirms the reward; sound and play are paused meanwhile.
   */
  showRewardedVideo(onRewarded: () => void): Promise<RewardedResult>
}

/** Pause reasons combine: the game is paused while any of them holds. */
export class PauseState {
  private reasons = new Set<string>()
  private listeners = new Set<(paused: boolean) => void>()

  get paused(): boolean {
    return this.reasons.size > 0
  }

  set(reason: string, on: boolean): void {
    const before = this.paused
    if (on) this.reasons.add(reason)
    else this.reasons.delete(reason)
    if (this.paused !== before) for (const listener of [...this.listeners]) listener(this.paused)
  }

  subscribe(listener: (paused: boolean) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }
}
