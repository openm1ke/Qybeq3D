import { storage } from '../platform/storage'

/** Optional layers of the cube view (`CubeViewPart`). */
export type CubeViewPart = 'freeCells' | 'plate' | 'grid' | 'edges'

/** First-game tips, shown until the player has done the thing once. */
export type Tip = 'rotate' | 'place'

/** The player's game settings (`AppSettings`, the part the web needs). */
export interface GameSettings {
  readonly reduceMotion: boolean
  readonly haptics: boolean
  readonly cubeView: Readonly<Record<CubeViewPart, boolean>>
  readonly learned: readonly Tip[]
}

const key = 'qybeq3d.settings.v1'

export const defaultCubeView: Record<CubeViewPart, boolean> = { freeCells: true, plate: true, grid: true, edges: false }

export function loadGameSettings(): GameSettings {
  try {
    const json = JSON.parse(storage.getItem(key) ?? '{}')
    const view = { ...defaultCubeView }
    for (const part of Object.keys(defaultCubeView) as CubeViewPart[]) {
      if (typeof json.cubeView?.[part] === 'boolean') view[part] = json.cubeView[part]
    }
    return {
      reduceMotion: json.reduceMotion === true,
      haptics: json.haptics !== false,
      cubeView: view,
      learned: Array.isArray(json.learned) ? json.learned.filter((t: unknown): t is Tip => t === 'rotate' || t === 'place') : [],
    }
  } catch {
    return { reduceMotion: false, haptics: true, cubeView: defaultCubeView, learned: [] }
  }
}

export function saveGameSettings(settings: GameSettings): void {
  try {
    storage.setItem(key, JSON.stringify(settings))
  } catch {
    // Optional storage.
  }
}

/** The in-app switch, or the system's "reduce motion". */
export function prefersReducedMotion(settings: GameSettings): boolean {
  return settings.reduceMotion || (typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true)
}
