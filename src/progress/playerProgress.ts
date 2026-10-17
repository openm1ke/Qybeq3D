import type { ThemePreset } from '../cosmetics/skins'
import { storage } from '../platform/storage'

/**
 * Durable puzzle records and the spendable cosmetic wallet, as on the phone
 * (`PlayerProgress`, `PuzzleAttemptResult`, `CompletionAward`). Earned stars
 * are derived from best results; only spending is stored as a counter, so
 * replaying a completion can never mint stars.
 */

export const progressStorageKey = 'qybeq3d.progress.v1'

/** Facts frozen at the moment a puzzle is completed. */
export interface PuzzleAttempt {
  readonly elapsedMs: number
  readonly assistanceUsed: boolean
  /** Solved within this, unassisted: three stars. */
  readonly fastTimeMs: number
}

export function attemptStars(attempt: PuzzleAttempt): number {
  if (attempt.assistanceUsed) return 1
  return attempt.elapsedMs <= attempt.fastTimeMs ? 3 : 2
}

/** What one completion changed in durable progress. */
export interface CompletionAward {
  readonly key: string
  readonly attemptStars: number
  readonly previousBest: number
  readonly earnedDelta: number
  readonly availableStars: number
  readonly isFirstCompletion: boolean
}

export interface DailyResult {
  readonly stars: number
  readonly elapsedMs: number
  readonly assistanceUsed: boolean
  readonly completedAt: string
}

export interface PlayerProgress {
  readonly bestStars: Readonly<Record<string, number>>
  readonly dailyResults: Readonly<Record<string, DailyResult>>
  readonly unlockedPresetIds: readonly string[]
  readonly starsSpent: number
}

const empty: PlayerProgress = { bestStars: {}, dailyResults: {}, unlockedPresetIds: ['classic'], starsSpent: 0 }

export function dayKey(date: Date): string {
  return `${String(date.getFullYear()).padStart(4, '0')}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

const isDayKey = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value)

export function loadPlayerProgress(): PlayerProgress {
  try {
    const json = JSON.parse(storage.getItem(progressStorageKey) ?? 'null')
    if (!json || typeof json !== 'object') return empty
    const bestStars: Record<string, number> = {}
    for (const [key, stars] of Object.entries(json.puzzleBestStars ?? {})) {
      if (key.startsWith('roll:') && Number.isInteger(stars) && (stars as number) >= 1 && (stars as number) <= 3) bestStars[key] = stars as number
    }
    const dailyResults: Record<string, DailyResult> = {}
    for (const [key, raw] of Object.entries(json.dailyResults ?? {})) {
      const r = raw as Partial<DailyResult & { assisted: boolean }>
      if (!isDayKey(key) || !Number.isInteger(r.stars) || r.stars! < 1 || r.stars! > 3 || !Number.isInteger(r.elapsedMs)) continue
      dailyResults[key] = { stars: r.stars!, elapsedMs: r.elapsedMs!, assistanceUsed: r.assisted === true, completedAt: String(r.completedAt ?? '') }
    }
    const unlocked = Array.isArray(json.unlockedPresetIds) ? json.unlockedPresetIds.filter((id: unknown): id is string => typeof id === 'string' && id !== '') : []
    return {
      bestStars,
      dailyResults,
      unlockedPresetIds: [...new Set(['classic', ...unlocked])],
      starsSpent: Number.isInteger(json.starsSpent) && json.starsSpent >= 0 ? json.starsSpent : 0,
    }
  } catch {
    return empty
  }
}

export function savePlayerProgress(progress: PlayerProgress): void {
  try {
    storage.setItem(progressStorageKey, JSON.stringify({
      schema: 1,
      puzzleBestStars: progress.bestStars,
      dailyResults: Object.fromEntries(Object.entries(progress.dailyResults).map(([key, r]) => [key, { stars: r.stars, elapsedMs: r.elapsedMs, assisted: r.assistanceUsed, completedAt: r.completedAt }])),
      starsSpent: progress.starsSpent,
      unlockedPresetIds: [...progress.unlockedPresetIds].sort(),
    }))
  } catch {
    // Optional storage.
  }
}

export function lifetimeEarned(progress: PlayerProgress): number {
  return Object.values(progress.bestStars).reduce((s, v) => s + v, 0) + Object.values(progress.dailyResults).reduce((s, r) => s + r.stars, 0)
}

export function availableStars(progress: PlayerProgress): number {
  return Math.max(0, lifetimeEarned(progress) - progress.starsSpent)
}

export function solvedPuzzleCount(progress: PlayerProgress): number {
  return Object.keys(progress.bestStars).length + Object.keys(progress.dailyResults).length
}

export function ownsPreset(progress: PlayerProgress, id: string): boolean {
  return id === 'classic' || progress.unlockedPresetIds.includes(id)
}

export function recordPuzzle(progress: PlayerProgress, puzzleKey: string, attempt: PuzzleAttempt): [PlayerProgress, CompletionAward] {
  const key = puzzleKey.startsWith('roll:') ? puzzleKey : `roll:${puzzleKey}`
  const previous = progress.bestStars[key] ?? 0
  const stars = attemptStars(attempt)
  const nextBest = Math.max(stars, previous)
  const next = nextBest === previous ? progress : { ...progress, bestStars: { ...progress.bestStars, [key]: nextBest } }
  return [next, { key, attemptStars: stars, previousBest: previous, earnedDelta: nextBest - previous, availableStars: availableStars(next), isFirstCompletion: previous === 0 }]
}

export function recordDaily(progress: PlayerProgress, day: Date, attempt: PuzzleAttempt, completedAt = new Date()): [PlayerProgress, CompletionAward] {
  const date = dayKey(day)
  const before = progress.dailyResults[date]
  const previous = before?.stars ?? 0
  const stars = attemptStars(attempt)
  const nextBest = Math.max(stars, previous)
  let next = progress
  if (nextBest !== previous) {
    next = {
      ...progress,
      dailyResults: {
        ...progress.dailyResults,
        [date]: {
          stars: nextBest,
          elapsedMs: stars >= previous ? attempt.elapsedMs : before!.elapsedMs,
          assistanceUsed: stars >= previous ? attempt.assistanceUsed : before!.assistanceUsed,
          completedAt: completedAt.toISOString(),
        },
      },
    }
  }
  return [next, { key: `daily:${date}`, attemptStars: stars, previousBest: previous, earnedDelta: nextBest - previous, availableStars: availableStars(next), isFirstCompletion: previous === 0 }]
}

export function purchasePreset(progress: PlayerProgress, preset: ThemePreset): PlayerProgress | null {
  if (ownsPreset(progress, preset.id)) return progress
  if (preset.price <= 0 || availableStars(progress) < preset.price) return null
  return { ...progress, starsSpent: progress.starsSpent + preset.price, unlockedPresetIds: [...progress.unlockedPresetIds, preset.id] }
}

const dateOf = (key: string) => {
  const [y, m, d] = key.split('-').map(Number)
  return Date.UTC(y, m - 1, d) / 86_400_000
}

/** The active Daily run: an unfinished today does not break yesterday's. */
export function currentDailyStreak(progress: PlayerProgress, now = new Date()): number {
  const completed = new Set(Object.keys(progress.dailyResults).map(dateOf))
  if (completed.size === 0) return 0
  let cursor = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) / 86_400_000
  if (!completed.has(cursor)) cursor -= 1
  let streak = 0
  while (completed.has(cursor)) {
    streak++
    cursor -= 1
  }
  return streak
}

export function bestDailyStreak(progress: PlayerProgress): number {
  const days = Object.keys(progress.dailyResults).map(dateOf).sort((a, b) => a - b)
  let best = 0
  let run = 0
  let previous = Number.NaN
  for (const day of days) {
    run = day === previous + 1 ? run + 1 : 1
    best = Math.max(best, run)
    previous = day
  }
  return best
}

export function dailyStarsFor(progress: PlayerProgress, day: Date): number {
  return progress.dailyResults[dayKey(day)]?.stars ?? 0
}
