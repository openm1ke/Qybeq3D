import type { ThemePreset } from '../cosmetics/skins'
import { storage } from '../platform/storage'

const storageKey = 'qybeq.progress.v1'

export interface PlayerProgress {
  availableStars: number
  solvedPuzzleCount: number
  unlockedThemeIds: readonly string[]
  dailyBestStars: Readonly<Record<string, number>>
}

const emptyProgress: PlayerProgress = {
  availableStars: 0,
  solvedPuzzleCount: 0,
  unlockedThemeIds: ['classic'],
  dailyBestStars: {},
}

function localDayKey(date = new Date()): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function loadPlayerProgress(): PlayerProgress {
  try {
    const parsed = JSON.parse(storage.getItem(storageKey) ?? 'null') as Partial<PlayerProgress> | null
    if (!parsed) return emptyProgress
    const unlocked = Array.isArray(parsed.unlockedThemeIds)
      ? parsed.unlockedThemeIds.filter((id): id is string => typeof id === 'string')
      : []
    const daily = parsed.dailyBestStars && typeof parsed.dailyBestStars === 'object'
      ? Object.fromEntries(Object.entries(parsed.dailyBestStars).filter(([, stars]) => typeof stars === 'number' && stars >= 1 && stars <= 3))
      : {}
    return {
      availableStars: Number.isInteger(parsed.availableStars) && (parsed.availableStars ?? -1) >= 0 ? parsed.availableStars! : 0,
      solvedPuzzleCount: Number.isInteger(parsed.solvedPuzzleCount) && (parsed.solvedPuzzleCount ?? -1) >= 0 ? parsed.solvedPuzzleCount! : 0,
      unlockedThemeIds: [...new Set(['classic', ...unlocked])],
      dailyBestStars: daily,
    }
  } catch {
    return emptyProgress
  }
}

export function savePlayerProgress(progress: PlayerProgress): void {
  try { storage.setItem(storageKey, JSON.stringify(progress)) } catch { /* Optional storage. */ }
}

export function awardCompletion(progress: PlayerProgress, source: 'new' | 'daily', stars: number, now = new Date()): PlayerProgress {
  const safeStars = Math.max(1, Math.min(3, Math.round(stars)))
  if (source === 'new') {
    return {
      ...progress,
      availableStars: progress.availableStars + safeStars,
      solvedPuzzleCount: progress.solvedPuzzleCount + 1,
    }
  }

  const day = localDayKey(now)
  const previous = progress.dailyBestStars[day] ?? 0
  const best = Math.max(previous, safeStars)
  return {
    ...progress,
    availableStars: progress.availableStars + best - previous,
    solvedPuzzleCount: progress.solvedPuzzleCount + (previous === 0 ? 1 : 0),
    dailyBestStars: { ...progress.dailyBestStars, [day]: best },
  }
}

export function purchaseTheme(progress: PlayerProgress, theme: ThemePreset): PlayerProgress | null {
  if (progress.unlockedThemeIds.includes(theme.id)) return progress
  if (theme.price <= 0 || progress.availableStars < theme.price) return null
  return {
    ...progress,
    availableStars: progress.availableStars - theme.price,
    unlockedThemeIds: [...progress.unlockedThemeIds, theme.id],
  }
}

export function currentDailyStreak(progress: PlayerProgress, now = new Date()): number {
  const completed = new Set(Object.keys(progress.dailyBestStars))
  if (completed.size === 0) return 0
  const cursor = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  if (!completed.has(localDayKey(cursor))) cursor.setDate(cursor.getDate() - 1)
  let streak = 0
  while (completed.has(localDayKey(cursor))) {
    streak += 1
    cursor.setDate(cursor.getDate() - 1)
  }
  return streak
}

export const playerProgressStorageKey = storageKey

/** The longest run of consecutive days with a completed Daily Challenge. */
export function bestDailyStreak(progress: PlayerProgress): number {
  const days = Object.keys(progress.dailyBestStars)
    .map((key) => {
      const [year, month, day] = key.split('-').map(Number)
      return Date.UTC(year, month - 1, day) / 86_400_000
    })
    .filter(Number.isFinite)
    .sort((a, b) => a - b)
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

/** Today's best Daily result (1–3 stars), or 0 if not yet solved. */
export function todaysDailyStars(progress: PlayerProgress, now = new Date()): number {
  return progress.dailyBestStars[localDayKey(now)] ?? 0
}
