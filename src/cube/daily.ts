import { CubeFormats } from './generator'

/**
 * The calendar of the daily cube (`daily_puzzle.dart`, `DailyCube`). Its
 * first day must never move: the day's index seeds the day's cube, and the
 * web must make the same daily cube as the phone.
 */
const epoch = new Date(2026, 0, 1)

const localMidnight = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate())

export function dailyKey(date: Date): string {
  const pad = (n: number, width = 2) => String(n).padStart(width, '0')
  return `${pad(date.getFullYear(), 4)}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/** Whole days since the epoch, as Dart's `difference(...).inDays` counts them. */
export function dailyDayIndex(date: Date): number {
  return Math.trunc((localMidnight(date).getTime() - epoch.getTime()) / 86_400_000)
}

export function nextDailyAt(now: Date): Date {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
}

export function msUntilNextDaily(now: Date): number {
  return Math.max(0, nextDailyAt(now).getTime() - now.getTime())
}

export const DailyCube = {
  format: CubeFormats.four,

  /** `(0x51b3a77d ^ (dayIndex * 0x0009e377)) & 0x7fffffff` with Dart's
   * 64-bit integers: only the low 31 bits survive the mask, and `Math.imul`
   * gives exactly the low 32 bits of the product. */
  seedFor(day: Date): number {
    return (0x51b3a77d ^ Math.imul(dailyDayIndex(day), 0x0009e377)) & 0x7fffffff
  },
}
