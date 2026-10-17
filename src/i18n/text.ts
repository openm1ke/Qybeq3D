import { createContext, useContext } from 'react'
import { storage } from '../platform/storage'
import en from './app_en.json'
import ru from './app_ru.json'

/**
 * The game's texts, taken as they are from the mobile app's `.arb` files
 * (`app_en.json`, `app_ru.json` are copies), so the web says exactly what the
 * phone says. Supports `{name}` placeholders and ICU plurals.
 */
export type Language = 'en' | 'ru'

type Params = Record<string, string | number>
const tables: Record<Language, Record<string, unknown>> = { en, ru }

export function format(language: Language, key: string, params: Params = {}): string {
  const raw = tables[language][key] ?? tables.en[key]
  if (typeof raw !== 'string') return key
  return render(raw, params, language)
}

/** Substitutes `{name}` and resolves `{count, plural, one{…} other{…}}`. */
function render(message: string, params: Params, language: Language): string {
  let out = ''
  let i = 0
  while (i < message.length) {
    const ch = message[i]
    if (ch !== '{') {
      out += ch
      i++
      continue
    }
    const end = matching(message, i)
    const body = message.slice(i + 1, end)
    const comma = body.indexOf(',')
    if (comma < 0) {
      out += String(params[body.trim()] ?? `{${body}}`)
    } else {
      const name = body.slice(0, comma).trim()
      const rest = body.slice(comma + 1).trim()
      if (rest.startsWith('plural')) {
        const value = Number(params[name] ?? 0)
        const cases = parseCases(rest.slice(rest.indexOf(',') + 1))
        const category = new Intl.PluralRules(language).select(value)
        const chosen = cases[`=${value}`] ?? cases[category] ?? cases.other ?? ''
        out += render(chosen, params, language)
      } else {
        out += String(params[name] ?? '')
      }
    }
    i = end + 1
  }
  return out
}

function matching(text: string, open: number): number {
  let depth = 0
  for (let i = open; i < text.length; i++) {
    if (text[i] === '{') depth++
    else if (text[i] === '}' && --depth === 0) return i
  }
  return text.length - 1
}

function parseCases(text: string): Record<string, string> {
  const cases: Record<string, string> = {}
  let i = 0
  while (i < text.length) {
    while (i < text.length && /\s/.test(text[i])) i++
    const open = text.indexOf('{', i)
    if (open < 0) break
    const name = text.slice(i, open).trim()
    const close = matching(text, open)
    cases[name] = text.slice(open + 1, close)
    i = close + 1
  }
  return cases
}

/** The texts in one language, with the mobile app's composed helpers. */
export function textFor(language: Language) {
  const f = (key: string, params?: Params) => format(language, key, params)
  return {
    language,
    t: f,
    hintsLeft: (free: number) => (free === 0 ? f('hintsNone') : free === 1 ? f('hintsOne') : f('hintsMany', { free })),
    stars: (count: number) => f('starsCount', { count }),
    cubeSize: (size: number) => f('cubeSize', { size }),
    formatName: (size: number) => f(size === 4 ? 'formatFour' : size === 5 ? 'formatFive' : 'formatThree'),
    formatDetail: (size: number) => f(size === 4 ? 'formatFourDetail' : size === 5 ? 'formatFiveDetail' : 'formatThreeDetail'),
    cosmeticName: (id: string, fallback: string) => {
      const key = `cosmetic${id.charAt(0).toUpperCase()}${id.slice(1)}`
      return key in tables[language] ? f(key) : fallback
    },
    presetName: (id: string, fallback: string) =>
      id === 'classic' ? (language === 'ru' ? 'Qybeq Классика' : 'Qybeq Classic') : textFor(language).cosmeticName(id, fallback),
    kind: (slot: string) => f(slot === 'pieces' ? 'pieceKind' : slot === 'dice' ? 'diceKind' : 'boardKind'),
  }
}

export type Text = ReturnType<typeof textFor>

export const TextContext = createContext<Text>(textFor('en'))

export function useText(): Text {
  return useContext(TextContext)
}

const storageKey = 'qybeq3d.language'

export function languageFor(code: string | null): Language {
  const base = (code ?? '').toLowerCase().split(/[-_]/)[0]
  return ['ru', 'be', 'kk', 'uk', 'uz', 'hy', 'az', 'ky', 'tg', 'tk'].includes(base) ? 'ru' : 'en'
}

export function loadLanguage(detected: string | null = typeof navigator === 'undefined' ? null : navigator.language): Language {
  const saved = storage.getItem(storageKey)
  if (saved === 'en' || saved === 'ru') return saved
  return languageFor(detected)
}

export function saveLanguage(language: Language): void {
  storage.setItem(storageKey, language)
}

/** mm:ss of a duration in milliseconds. */
export function formatClock(ms: number): string {
  const total = Math.floor(Math.max(0, ms) / 1000)
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}
