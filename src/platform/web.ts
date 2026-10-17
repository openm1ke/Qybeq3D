import { PauseState, type Platform } from './platform'

/** The open web (GitHub Pages): no SDK, no ads, analytics with consent. */
export function createWebPlatform(): Platform {
  const pause = new PauseState()
  return {
    id: 'web',
    init: () => Promise.resolve(),
    detectedLanguage: () => (typeof navigator === 'undefined' ? null : navigator.language),
    ready: () => {},
    setGameplayActive: () => {},
    onPauseChange: (listener) => pause.subscribe(listener),
    get paused() {
      return pause.paused
    },
    rewardedAds: false,
    showRewardedVideo: () => Promise.resolve('unavailable'),
  }
}
