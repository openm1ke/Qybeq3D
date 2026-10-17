import type { Language } from './text'

/** The few texts only the open web has (the analytics consent prompt). */
export const webText: Record<Language, { privacy: string; consentTitle: string; consentBody: string; allow: string; decline: string }> = {
  en: {
    privacy: 'Privacy',
    consentTitle: 'Help improve Qybeq?',
    consentBody: 'Allow anonymous analytics about visits, sessions, puzzle results and feature usage. Piece positions, contacts and precise location are not sent.',
    allow: 'Allow',
    decline: 'Not now',
  },
  ru: {
    privacy: 'Конфиденциальность',
    consentTitle: 'Помочь улучшить Qybeq?',
    consentBody: 'Разрешите анонимную аналитику посещений, сессий, результатов головоломок и использования функций. Расположение фигур, контакты и точная геолокация не передаются.',
    allow: 'Разрешить',
    decline: 'Не сейчас',
  },
}
