import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { loadAnalyticsPreference, setAnalyticsEnabled, trackGoal, trackPage, type AnalyticsPreference } from './analytics/metrika'
import { gameAudio, loadAudioSettings, saveAudioSettings, type AudioSettings } from './audio/audioService'
import { PrimaryAction, SecondaryAction, Sheet } from './components/ui'
import { activePreset, AppearanceContext, loadAppearance, saveAppearance, type Appearance } from './cosmetics/appearance'
import type { ThemePreset } from './cosmetics/skins'
import { dailyKey } from './cube/daily'
import type { CubeFormat } from './cube/generator'
import { CubeSession } from './cube/session'
import { CubeRepository, dailySessionFor } from './cube/storage'
import { formatClock, loadLanguage, saveLanguage, TextContext, textFor, type Language } from './i18n/text'
import { webText } from './i18n/web'
import { platform } from './platform'
import { webExtras } from './platform/webExtras'
import {
  availableStars,
  loadPlayerProgress,
  purchasePreset,
  recordDaily,
  recordPuzzle,
  savePlayerProgress,
  solvedPuzzleCount,
  type CompletionAward,
  type PlayerProgress,
  type PuzzleAttempt,
} from './progress/playerProgress'
import { CustomizeScreen } from './screens/CustomizeScreen'
import { FormatSheet } from './screens/FormatSheet'
import { CubeScreen } from './screens/game/CubeScreen'
import { HowToPlay } from './screens/HowToPlay'
import { MainMenu } from './screens/MainMenu'
import { SettingsScreen } from './screens/SettingsScreen'
import { loadGameSettings, prefersReducedMotion, saveGameSettings, type GameSettings } from './settings/gameSettings'
import './App.css'
import './game.css'
import './cube.css'

type Page = 'customize' | 'settings' | 'howto'

/** The cube being played: the everyday one or the day's. */
interface GameRoute {
  readonly session: CubeSession
  readonly daily: Date | null
  readonly format?: CubeFormat
  /** A new key mounts a fresh screen. */
  readonly key: number
}

/** The unfinished everyday cube, as it was left. */
function everydaySession(): CubeSession {
  const session = new CubeSession()
  const saved = CubeRepository.load()
  if (saved && !session.restore(saved)) CubeRepository.clear()
  return session
}

/**
 * The app (mobile `QybeqApp` with its routes): the main menu or the game at
 * the bottom, secondary pages (settings, customize, how to play) over it.
 */
export default function App() {
  const [progress, setProgressState] = useState<PlayerProgress>(loadPlayerProgress)
  const progressRef = useRef(progress)
  const [appearance, setAppearance] = useState<Appearance>(() => loadAppearance(new Set(progress.unlockedPresetIds)))
  const [audioSettings, setAudioSettings] = useState<AudioSettings>(loadAudioSettings)
  const [settings, setSettings] = useState<GameSettings>(loadGameSettings)
  const [language, setLanguage] = useState<Language>(() => loadLanguage(platform.detectedLanguage()))
  // Analytics (and its consent prompt) exist on the open web only.
  const [analytics, setAnalytics] = useState<AnalyticsPreference>(() => (webExtras ? loadAnalyticsPreference() : false))
  const [everyday] = useState(everydaySession)
  const [game, setGame] = useState<GameRoute | null>(null)
  const [pages, setPages] = useState<Page[]>([])
  const [choosing, setChoosing] = useState(false)
  const [confirmFormat, setConfirmFormat] = useState<CubeFormat | null>(null)
  const gameKey = useRef(0)
  const text = useMemo(() => textFor(language), [language])
  const reduceMotion = prefersReducedMotion(settings)

  const setProgress = (next: PlayerProgress) => {
    progressRef.current = next
    setProgressState(next)
    savePlayerProgress(next)
  }

  useEffect(() => {
    gameAudio.configure(audioSettings)
    saveAudioSettings(audioSettings)
  }, [audioSettings])

  useEffect(() => saveGameSettings(settings), [settings])

  useEffect(() => {
    // Every gesture may (re)start audio: browsers only allow it from one.
    const unlock = () => gameAudio.unlock()
    document.addEventListener('pointerdown', unlock)
    document.addEventListener('keydown', unlock)
    return () => {
      document.removeEventListener('pointerdown', unlock)
      document.removeEventListener('keydown', unlock)
    }
  }, [])

  useEffect(() => {
    // The menu is up and interactive: the game can be played.
    platform.ready()
  }, [])

  useEffect(() => {
    document.documentElement.lang = language
  }, [language])

  useEffect(() => {
    if (webExtras && analytics !== null) setAnalyticsEnabled(analytics)
  }, [analytics])

  const screenName = pages.at(-1) ?? (game ? 'game' : 'menu')
  useEffect(() => {
    if (analytics) trackPage(screenName)
  }, [analytics, screenName])

  const updateSettings = useCallback((update: (settings: GameSettings) => GameSettings) => setSettings(update), [])

  const chooseLanguage = (next: Language) => {
    setLanguage(next)
    saveLanguage(next)
  }

  const chooseAnalytics = (enabled: boolean) => {
    setAnalytics(enabled)
    setAnalyticsEnabled(enabled)
  }

  const changeAppearance = (next: Appearance, source: string) => {
    setAppearance(next)
    saveAppearance(next)
    gameAudio.playEffect('turn')
    trackGoal('theme_selected', { theme_id: activePreset(next)?.id ?? 'custom', source })
  }

  const unlockPreset = (preset: ThemePreset): boolean => {
    const next = purchasePreset(progressRef.current, preset)
    if (!next) return false
    setProgress(next)
    gameAudio.playEffect('complete')
    trackGoal('theme_unlocked', { theme_id: preset.id, price: preset.price, stars_after: availableStars(next) })
    return true
  }

  const push = (page: Page) => setPages((stack) => [...stack, page])
  const pop = () => setPages((stack) => stack.slice(0, -1))

  const openGame = (route: Omit<GameRoute, 'key'>) => {
    gameKey.current++
    setPages([])
    setGame({ ...route, key: gameKey.current })
  }

  /** Which cube, then a fresh throw. An unfinished cube is only replaced
   * once the player confirms. */
  const startFormat = (format: CubeFormat) => {
    setChoosing(false)
    if (everyday.isResumable) return setConfirmFormat(format)
    playFormat(format)
  }

  const playFormat = (format: CubeFormat) => {
    setConfirmFormat(null)
    everyday.discardPuzzle()
    CubeRepository.clear()
    trackGoal('puzzle_started', { mode: 'normal', cube_size: format.size, source: 'menu' })
    openGame({ session: everyday, daily: null, format })
  }

  const openDaily = () => {
    const day = new Date()
    trackGoal('daily_opened', { source: 'menu' })
    openGame({ session: dailySessionFor(day), daily: day })
  }

  /** The cube is complete: its stars go on the player's record. */
  const recordSolved = useCallback((session: CubeSession, daily: Date | null): CompletionAward | null => {
    const key = session.puzzleKey
    if (session.rewardsDisabled || !key) return null
    const attempt: PuzzleAttempt = { elapsedMs: session.solvedInMs ?? 0, assistanceUsed: session.assistanceUsed, fastTimeMs: session.format.fastTimeMs }
    const now = new Date()
    // A daily cube left open past midnight counts no more.
    if (daily && dailyKey(daily) !== dailyKey(now)) return null
    const [next, award] = daily ? recordDaily(progressRef.current, daily, attempt, now) : recordPuzzle(progressRef.current, key, attempt)
    setProgress(next)
    trackGoal('puzzle_completed', {
      mode: daily ? 'daily' : 'normal',
      elapsed_seconds: Math.floor(attempt.elapsedMs / 1000),
      stars_awarded: award.attemptStars,
      stars_earned: award.earnedDelta,
      assistance_used: attempt.assistanceUsed,
      first_completion: award.isFirstCompletion,
      solved_after: solvedPuzzleCount(next),
      cube_size: session.format.size,
    })
    return award
  }, [])

  const preset = activePreset(appearance)
  const page = pages.at(-1)
  const pageView = page === 'customize' ? (
    <CustomizeScreen
      appearance={appearance}
      stars={availableStars(progress)}
      owned={new Set(progress.unlockedPresetIds)}
      onChange={changeAppearance}
      onPurchase={unlockPreset}
      onBack={pop}
    />
  ) : page === 'howto' ? (
    <HowToPlay reduceMotion={reduceMotion} onDone={pop} />
  ) : page === 'settings' ? (
    <SettingsScreen
      audio={audioSettings}
      game={settings}
      language={language}
      analyticsEnabled={analytics === true}
      appearanceDetail={preset ? text.presetName(preset.id, preset.name) : text.t('customMix')}
      onAudio={setAudioSettings}
      onGame={updateSettings}
      onLanguage={chooseLanguage}
      onAnalytics={chooseAnalytics}
      onCustomize={() => push('customize')}
      onHowToPlay={() => push('howto')}
      onBack={pop}
    />
  ) : null

  const resumeDetail = everyday.isResumable
    ? `${text.cubeSize(everyday.format.size)} · ${text.t('continueDetail', { placed: everyday.placedCount, total: everyday.pieceCount, time: formatClock(everyday.elapsedMs) })}`
    : null

  return (
    <TextContext.Provider value={text}>
      <AppearanceContext.Provider value={appearance}>
        {game ? (
          <CubeScreen
            key={game.key}
            session={game.session}
            dailyDate={game.daily}
            format={game.format}
            settings={settings}
            onSettings={updateSettings}
            covered={page !== undefined}
            onSolved={(session) => recordSolved(session, game.daily)}
            onMainMenu={() => setGame(null)}
            onOpenPage={push}
            onLeaveDaily={() => {
              everyday.discardPuzzle()
              CubeRepository.clear()
              openGame({ session: everyday, daily: null, format: everyday.format })
            }}
          />
        ) : (
          !page && (
            <MainMenu
              progress={progress}
              reduceMotion={reduceMotion}
              resumeDetail={resumeDetail}
              onContinue={() => openGame({ session: everyday, daily: null })}
              onPlay={() => setChoosing(true)}
              onDaily={openDaily}
              onCustomize={() => { trackGoal('customization_opened', { source: 'menu' }); push('customize') }}
              onSettings={() => { trackGoal('settings_opened'); push('settings') }}
              onHowToPlay={() => { trackGoal('how_to_play_opened'); push('howto') }}
              footer={webExtras ? <a className="menu-footer-link" href="./privacy.html">{text.t('privacyPolicy')}</a> : null}
            />
          )
        )}
        {pageView && <div className="cube-page">{pageView}</div>}
        {choosing && <FormatSheet current={everyday.format} onChoose={startFormat} onDismiss={() => setChoosing(false)} />}
        {confirmFormat && (
          <Sheet label={text.t('newPuzzleTitle')} onDismiss={() => setConfirmFormat(null)}>
            <h2 className="sheet-title">{text.t('newPuzzleTitle')}</h2>
            <p className="sheet-body">{text.t('newPuzzleBody')}</p>
            <div className="sheet-actions">
              <PrimaryAction label={text.t('newPuzzle')} compact onPress={() => playFormat(confirmFormat)} />
              <SecondaryAction label={text.t('cancel')} compact onPress={() => setConfirmFormat(null)} />
            </div>
          </Sheet>
        )}
        {webExtras && analytics === null && (
          <section className="analytics-consent" role="dialog" aria-labelledby="analytics-consent-title">
            <div>
              <span className="eyebrow">{webText[language].privacy}</span>
              <h2 id="analytics-consent-title">{webText[language].consentTitle}</h2>
              <p>{webText[language].consentBody}</p>
            </div>
            <div className="analytics-consent-actions">
              <a href="./privacy.html">{text.t('privacyPolicy')}</a>
              <button type="button" onClick={() => chooseAnalytics(false)}>{webText[language].decline}</button>
              <button className="consent-primary" type="button" onClick={() => chooseAnalytics(true)}>{webText[language].allow}</button>
            </div>
          </section>
        )}
      </AppearanceContext.Provider>
    </TextContext.Provider>
  )
}
