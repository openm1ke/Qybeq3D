import { storage } from '../platform/storage'

const counterId = 113110265
const preferenceKey = 'qybeq.analytics.v1'
const scriptId = 'qybeq-yandex-metrika'
const disabledProperty = `disableYaCounter${counterId}`

type MetrikaMethod = 'init' | 'hit' | 'reachGoal' | 'destruct'
type Metrika = (id: number, method: MetrikaMethod, ...args: unknown[]) => void

declare global {
  interface Window {
    ym?: Metrika & { a?: unknown[][]; l?: number }
    dataLayer?: unknown[]
    [key: `disableYaCounter${number}`]: boolean | undefined
  }
}

let initialized = false
let enabled = false

export type AnalyticsPreference = boolean | null

export function loadAnalyticsPreference(): AnalyticsPreference {
  try {
    const value = storage.getItem(preferenceKey)
    if (value === 'enabled') return true
    if (value === 'disabled') return false
  } catch { /* Optional storage. */ }
  return null
}

export function saveAnalyticsPreference(value: boolean): void {
  try { storage.setItem(preferenceKey, value ? 'enabled' : 'disabled') } catch { /* Optional storage. */ }
}

function installQueue(): Metrika {
  if (window.ym) return window.ym
  const queue = ((...args: unknown[]) => { queue.a = queue.a ?? []; queue.a.push(args) }) as Metrika & { a?: unknown[][]; l?: number }
  queue.l = Date.now()
  window.ym = queue
  return queue
}

function initialize(): void {
  // Yandex Games builds carry no third-party scripts; this also drops the
  // counter's URL from that bundle.
  if (import.meta.env.VITE_PLATFORM === 'yandex') return
  if (initialized) return
  window[disabledProperty] = false
  window.dataLayer = window.dataLayer ?? []
  const ym = installQueue()
  if (!document.getElementById(scriptId)) {
    const script = document.createElement('script')
    script.id = scriptId
    script.async = true
    script.src = `https://mc.yandex.ru/metrika/tag.js?id=${counterId}`
    document.head.appendChild(script)
  }
  ym(counterId, 'init', {
    ssr: true,
    defer: true,
    clickmap: true,
    ecommerce: 'dataLayer',
    referrer: document.referrer,
    url: location.href,
    accurateTrackBounce: true,
    trackLinks: true,
  })
  initialized = true
}

export function setAnalyticsEnabled(value: boolean): void {
  enabled = value
  saveAnalyticsPreference(value)
  if (value) {
    initialize()
    return
  }
  window[disabledProperty] = true
  if (initialized) window.ym?.(counterId, 'destruct')
  initialized = false
}

export function trackPage(screen: string): void {
  if (!enabled) return
  initialize()
  window.ym?.(counterId, 'hit', `${location.origin}${location.pathname}#${screen}`, { title: `Qybeq · ${screen}` })
}

export function trackGoal(name: string, parameters: Record<string, string | number | boolean> = {}): void {
  if (!enabled) return
  initialize()
  window.ym?.(counterId, 'reachGoal', name, { platform: 'web', app_version: '0.2', ...parameters })
}

export const metrikaCounterId = counterId
