import { format, textFor } from '../i18n/text'

describe('texts from the mobile app', () => {
  it('fills placeholders and picks Russian plural forms', () => {
    expect(format('ru', 'progress', { placed: 2, total: 7 })).toBe('Размещено 2 из 7')
    expect(format('ru', 'starsCount', { count: 1 })).toBe('1 звезда')
    expect(format('ru', 'starsCount', { count: 3 })).toBe('3 звезды')
    expect(format('ru', 'starsCount', { count: 5 })).toBe('5 звёзд')
    expect(format('en', 'cubeSize', { size: 4 })).toBe('4×4×4')
  })

  it('composes the helpers', () => {
    const ru = textFor('ru')
    expect(ru.formatName(5)).toBe('Эксперт')
    expect(ru.hintsLeft(0)).toBe(format('ru', 'hintsNone'))
  })
})
