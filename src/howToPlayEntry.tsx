import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { AppearanceContext, loadAppearance } from './cosmetics/appearance'
import { loadLanguage, TextContext, textFor, type Language } from './i18n/text'
import { loadPlayerProgress } from './progress/playerProgress'
import { HowToPlay } from './screens/HowToPlay'
import { loadGameSettings, prefersReducedMotion } from './settings/gameSettings'
import './index.css'
import './App.css'
import './game.css'
import './cube.css'

// The tutorial as its own page (linked from Support): the same screen as in
// the game, in the player's language and appearance. `?lang=ru|en` picks the
// language for visitors who have not opened the game yet.
const requested = new URLSearchParams(location.search).get('lang')
const language: Language = requested === 'ru' || requested === 'en' ? requested : loadLanguage()
const text = textFor(language)
document.documentElement.lang = language
document.title = `Qybeq — ${text.t('howToPlay')}`
const appearance = loadAppearance(new Set(loadPlayerProgress().unlockedPresetIds))

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <TextContext.Provider value={text}>
      <AppearanceContext.Provider value={appearance}>
        <HowToPlay reduceMotion={prefersReducedMotion(loadGameSettings())} onDone={() => location.assign('./')} />
      </AppearanceContext.Provider>
    </TextContext.Provider>
  </StrictMode>,
)
