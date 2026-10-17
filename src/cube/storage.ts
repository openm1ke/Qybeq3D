import { storage } from '../platform/storage'
import { dailyKey, DailyCube } from './daily'
import { CubeSession, decodeSavedCube, encodeSavedCube, type SavedCube } from './session'

/** Where the unfinished everyday cube lives between visits (`CubeRepository`). */
export const CubeRepository = {
  storageKey: 'qybeq3d.cube.current.v1',

  load(): SavedCube | null {
    const raw = storage.getItem(this.storageKey)
    return raw ? decodeSavedCube(raw) : null
  },

  /** Writes the session if it can be resumed, otherwise clears the slot. */
  saveSession(session: CubeSession): void {
    const saved = session.toSaved()
    if (saved) storage.setItem(this.storageKey, encodeSavedCube(saved))
    else storage.removeItem(this.storageKey)
  },

  clear(): void {
    storage.removeItem(this.storageKey)
  },
}

/** One unfinished daily attempt, kept apart from the everyday cube. */
export const DailyCubeRepository = {
  storageKey: 'qybeq3d.cube.daily.v1',

  load(day: Date): SavedCube | null {
    try {
      const raw = storage.getItem(this.storageKey)
      if (!raw) return null
      const json = JSON.parse(raw)
      if (json.date !== dailyKey(day) || typeof json.game !== 'string') return null
      return decodeSavedCube(json.game)
    } catch {
      return null
    }
  },

  save(day: Date, session: CubeSession): void {
    const saved = session.toSaved()
    if (!saved) return this.clear()
    storage.setItem(this.storageKey, JSON.stringify({ date: dailyKey(day), game: encodeSavedCube(saved) }))
  },

  clear(): void {
    storage.removeItem(this.storageKey)
  },
}

/** The day's cube, already thrown, or the saved attempt at it. */
export function dailySessionFor(day: Date): CubeSession {
  const session = new CubeSession()
  const saved = DailyCubeRepository.load(day)
  if (!saved || !session.restore(saved)) {
    if (saved) DailyCubeRepository.clear()
    session.newPuzzle(DailyCube.format, DailyCube.seedFor(day))
  }
  return session
}
