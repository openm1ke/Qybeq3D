import { PauseState, type Platform, type RewardedResult } from './platform'
import { setStorageBackend, type KeyValueStore } from './storage'

/**
 * Yandex Games: the SDK is loaded by `<script src="/sdk.js">` in the
 * archive's index.html (requirement 1.19.1) and started here before the
 * game renders, so the language comes from the SDK at launch (2.14).
 *
 * - `LoadingAPI.ready()` once the menu is interactive (1.19.2);
 * - `GameplayAPI.start()/stop()` follow the puzzle actually being played,
 *   hidden tabs and platform pauses included (1.19.3);
 * - `game_api_pause/resume` and rewarded videos pause sound and play
 *   (1.3, 1.19.4, 4.7);
 * - the SDK's safe storage replaces localStorage (progress survives iOS).
 */

interface YandexSdk {
  environment?: { i18n?: { lang?: string } }
  features?: {
    LoadingAPI?: { ready(): void }
    GameplayAPI?: { start(): void; stop(): void }
  }
  adv?: {
    showRewardedVideo(options: {
      callbacks: {
        onOpen?: () => void
        onRewarded?: () => void
        onClose?: (wasShown: boolean) => void
        onError?: (error: unknown) => void
      }
    }): void
  }
  on?(event: string, listener: () => void): void
  getStorage?(): Promise<KeyValueStore>
}

declare global {
  interface Window {
    YaGames?: { init(): Promise<YandexSdk> }
  }
}

const initTimeoutMs = 8000

export function createYandexPlatform(): Platform {
  const pause = new PauseState()
  let sdk: YandexSdk | null = null
  let readyReported = false
  let gameplayWanted = false
  let gameplayReported = false
  let adInFlight = false

  const syncGameplay = () => {
    const active = gameplayWanted && !document.hidden && !pause.paused
    if (!sdk || active === gameplayReported) return
    gameplayReported = active
    try {
      if (active) sdk.features?.GameplayAPI?.start()
      else sdk.features?.GameplayAPI?.stop()
    } catch {
      /* Markup is best effort. */
    }
  }

  const init = async () => {
    // A long tap or right click on the game never opens the browser menu
    // (1.6.1.8, 1.6.2.7).
    document.addEventListener('contextmenu', (event) => event.preventDefault())
    document.addEventListener('visibilitychange', syncGameplay)
    pause.subscribe(syncGameplay)

    const loader = window.YaGames
    if (!loader) return
    try {
      sdk = await Promise.race([
        loader.init(),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), initTimeoutMs)),
      ])
    } catch {
      sdk = null
      return
    }
    sdk.on?.('game_api_pause', () => pause.set('platform', true))
    sdk.on?.('game_api_resume', () => pause.set('platform', false))
    try {
      const safe = await sdk.getStorage?.()
      if (safe) setStorageBackend(safe)
    } catch {
      /* localStorage stays. */
    }
  }

  const showRewardedVideo = (onRewarded: () => void) =>
    new Promise<RewardedResult>((resolve) => {
      const adv = sdk?.adv
      if (!adv || adInFlight) {
        resolve('unavailable')
        return
      }
      adInFlight = true
      let rewarded = false
      let opened = false
      let settled = false
      const finish = (result: RewardedResult) => {
        if (settled) return
        settled = true
        adInFlight = false
        pause.set('ad', false)
        resolve(rewarded ? 'rewarded' : result)
      }
      // Sound and play stop as the video is asked for, not after it opens.
      pause.set('ad', true)
      try {
        adv.showRewardedVideo({
          callbacks: {
            onOpen: () => {
              opened = true
            },
            onRewarded: () => {
              if (rewarded) return
              rewarded = true
              onRewarded()
            },
            onClose: (wasShown) => finish(wasShown || opened ? 'dismissed' : 'unavailable'),
            onError: () => finish('failed'),
          },
        })
      } catch {
        finish('failed')
      }
    })

  return {
    id: 'yandex',
    init,
    detectedLanguage: () => sdk?.environment?.i18n?.lang ?? null,
    ready: () => {
      if (readyReported || !sdk) return
      readyReported = true
      try {
        sdk.features?.LoadingAPI?.ready()
      } catch {
        /* Best effort. */
      }
    },
    setGameplayActive: (active) => {
      gameplayWanted = active
      syncGameplay()
    },
    onPauseChange: (listener) => pause.subscribe(listener),
    get paused() {
      return pause.paused
    },
    get rewardedAds() {
      return sdk?.adv != null
    },
    showRewardedVideo,
  }
}
