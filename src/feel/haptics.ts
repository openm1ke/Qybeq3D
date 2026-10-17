/**
 * Touch feedback (`GameHaptics`): what the player can feel during play. On
 * the web it goes through `navigator.vibrate` (Android browsers; iPhone
 * Safari has no vibration API, so it is simply silent there). Rapid ticks
 * are thinned out as on the phone.
 */
export type Haptic =
  | 'pickup'
  | 'snap'
  | 'fitTurn'
  | 'turn'
  | 'place'
  | 'reject'
  | 'diceHit'
  | 'dieHome'
  | 'land'
  | 'complete'
  | 'layer'

/** Milliseconds of vibration: light ≈ the phone's light impact, and so on. */
const patterns: Record<Haptic, number | number[]> = {
  snap: 6,
  turn: 6,
  diceHit: 6,
  pickup: 12,
  fitTurn: 12,
  dieHome: 12,
  land: 12,
  layer: 12,
  place: 22,
  reject: [12, 78, 12],
  complete: 40,
}

const gaps: Partial<Record<Haptic, number>> = { snap: 50, diceHit: 60, layer: 80 }

const last = new Map<Haptic, number>()

export function feel(haptic: Haptic, enabled: boolean): void {
  if (!enabled || typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return
  const gap = gaps[haptic]
  if (gap !== undefined) {
    const now = performance.now()
    const before = last.get(haptic)
    if (before !== undefined && now - before < gap) return
    last.set(haptic, now)
  }
  try {
    navigator.vibrate(patterns[haptic])
  } catch {
    // Some browsers refuse vibration outside a gesture: nothing to feel.
  }
}

export const vibrationSupported = typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function'
