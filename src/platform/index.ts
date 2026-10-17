import { createWebPlatform } from './web'
import { createVKPlatform } from './vk'
import { createYandexPlatform } from './yandex'

export type { Platform, RewardedResult } from './platform'

/**
 * The platform this build targets, fixed at build time by
 * `VITE_PLATFORM` (`npm run build` for the web, `npm run build:yandex` for
 * Yandex Games, `npm run build:vk` for VK Games); the other platform code is
 * left out of the bundle.
 *
 * Web-only UI (analytics consent, links to the privacy policy) checks that
 * the build is neither Yandex nor VK, so the platform
 * bundle does not even contain it: Yandex Games allows no external links
 * (requirements 8.4.2, 3.5) and no third-party scripts.
 */
const target = import.meta.env.VITE_PLATFORM ?? 'web'

export const platform = target === 'yandex'
  ? createYandexPlatform()
  : target === 'vk'
    ? createVKPlatform()
    : createWebPlatform()
