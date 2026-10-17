import bridge, { type ParentConfigData } from '@vkontakte/vk-bridge'
import { PauseState, type Platform, type RewardedResult } from './platform'
import { setStorageBackend } from './storage'
import { VKStorage, type VKStorageTransport } from './vkStorage'

export const VK_STORAGE_KEYS = [
  'qybeq.analytics.v1',
  'qybeq.language.v1',
  'qybeq.audio.v1',
  'qybeq.progress.v1',
  'qybeq.appearance.v1',
  'qybeq.savedGame.v1',
  'qybeq.savedDaily.v1',
  'qybeq.tips.v1',
] as const

export function timeout<T>(promise: Promise<T>, ms = 10_000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('VK request timed out')), ms)
    promise.then((value) => { clearTimeout(timer); resolve(value) }, (error) => { clearTimeout(timer); reject(error) })
  })
}

type VKInsets = { top: number; right: number; bottom: number; left: number }

function applyConfig(config: ParentConfigData): void {
  if ('insets' in config && config.insets) applyInsets(config.insets)
  if ('adaptivity' in config && config.adaptivity?.startsWith('force_mobile')) {
    document.documentElement.dataset.vkMobile = 'true'
  }
}
function applyInsets(insets: VKInsets): void {
  for (const edge of ['top', 'right', 'bottom', 'left'] as const) {
    const value = Number.isFinite(insets[edge]) ? Math.max(0, Math.min(200, insets[edge])) : 0
    document.documentElement.style.setProperty(`--vk-inset-${edge}`, `${value}px`)
  }
}

const localStorageOrNull = (): Storage | null => {
  try { return window.localStorage } catch { return null }
}

/** VK Games adapter: VK Storage, lifecycle signals and rewarded video ads. */
export function createVKPlatform(): Platform {
  const pause = new PauseState()
  let initialized = false
  let locale: string | null = null
  let storage: VKStorage | null = null
  let adInFlight = false

  const flush = () => { void storage?.flush().catch(() => {}) }

  const init = async () => {
    if (!bridge.isEmbedded()) throw new Error('Open this build inside VK')
    await timeout(bridge.send('VKWebAppInit'))
    const params = await timeout(bridge.send('VKWebAppGetLaunchParams'))
    const expectedId = import.meta.env.VITE_VK_APP_ID
    if (expectedId && String(params.vk_app_id) !== expectedId) throw new Error('Unexpected VK app ID')
    if (!params.vk_app_id || !params.vk_user_id) throw new Error('Missing VK launch parameters')
    locale = params.vk_language
    try { applyConfig(await timeout(bridge.send('VKWebAppGetConfig'), 3000)) } catch { /* Safe-area fallback. */ }

    const transport: VKStorageTransport = {
      async get(keys) {
        const result = await timeout(bridge.send('VKWebAppStorageGet', { keys }))
        return Object.fromEntries(result.keys.map(({ key, value }) => [key, value]))
      },
      async set(key, value) {
        const result = await timeout(bridge.send('VKWebAppStorageSet', { key, value }))
        if (!result.result) throw new Error('VK did not confirm the save')
      },
    }
    storage = new VKStorage(transport, VK_STORAGE_KEYS, localStorageOrNull())
    await storage.hydrate()
    setStorageBackend(storage)
    initialized = true

    bridge.subscribe((event) => {
      const { type, data } = event.detail
      if (type === 'VKWebAppViewHide') {
        pause.set('platform', true)
        flush()
      } else if (type === 'VKWebAppViewRestore') {
        pause.set('platform', false)
      } else if (type === 'VKWebAppUpdateConfig') {
        applyConfig(data)
      } else if (type === 'VKWebAppUpdateInsets') {
        applyInsets(data.insets)
      }
    })
    window.addEventListener('pagehide', flush)
    document.addEventListener('visibilitychange', () => {
      pause.set('visibility', document.hidden)
      if (document.hidden) flush()
    })
    document.documentElement.dataset.platform = 'vk'
  }

  const showRewardedVideo = async (onRewarded: () => void): Promise<RewardedResult> => {
    if (!initialized || adInFlight) return 'unavailable'
    adInFlight = true
    pause.set('ad', true)
    try {
      const available = await timeout(bridge.send('VKWebAppCheckNativeAds', { ad_format: 'reward', use_waterfall: true }))
      if (!available.result) return 'unavailable'
      const shown = await timeout(bridge.send('VKWebAppShowNativeAds', { ad_format: 'reward', use_waterfall: true }), 60_000)
      if (!shown.result) return 'dismissed'
      onRewarded()
      return 'rewarded'
    } catch {
      return 'failed'
    } finally {
      adInFlight = false
      pause.set('ad', false)
    }
  }

  return {
    id: 'vk',
    init,
    detectedLanguage: () => locale ?? (typeof navigator === 'undefined' ? null : navigator.language),
    ready: () => {},
    setGameplayActive: () => {},
    onPauseChange: (listener) => pause.subscribe(listener),
    get paused() { return pause.paused },
    get rewardedAds() { return initialized },
    showRewardedVideo,
  }
}
