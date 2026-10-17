import type { ReactNode } from 'react'
import type { AudioSettings } from '../audio/audioService'
import { Icon } from '../components/Icon'
import { ScreenFrame } from '../components/ScreenFrame'
import { vibrationSupported } from '../feel/haptics'
import { webExtras } from '../platform/webExtras'
import { useText, type Language } from '../i18n/text'
import type { GameSettings } from '../settings/gameSettings'


/** Deliberately small: every switch here does something real (mobile
 * `SettingsScreen`, the parts a browser has). */
export function SettingsScreen({ audio, game, language, analyticsEnabled, appearanceDetail, onAudio, onGame, onLanguage, onAnalytics, onCustomize, onHowToPlay, onBack }: {
  audio: AudioSettings
  game: GameSettings
  language: Language
  analyticsEnabled: boolean
  appearanceDetail: string
  onAudio: (settings: AudioSettings) => void
  onGame: (update: (settings: GameSettings) => GameSettings) => void
  onLanguage: (language: Language) => void
  onAnalytics: (enabled: boolean) => void
  onCustomize: () => void
  onHowToPlay: () => void
  onBack: () => void
}) {
  const text = useText()
  const systemReduce = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true
  return (
    <ScreenFrame title={text.t('settings')} backLabel={text.t('back')} onBack={onBack}>
      <div className="settings-body">
        <Section title={text.t('sectionGame')}>
          <button type="button" className="settings-row link" onClick={onCustomize}>
            <RowText title={text.t('appearance')} detail={appearanceDetail} />
            <Icon name="chevronRightRounded" size={24} color="#7A808C" />
          </button>
        </Section>
        <Section title={text.t('sectionAudio')}>
          <Toggle title={text.t('backgroundMusic')} detail={text.t('backgroundMusicDetail')} checked={audio.musicEnabled} onChange={(value) => onAudio({ ...audio, musicEnabled: value })} />
          <label className="settings-row volume">
            <RowText title={text.t('musicVolume')} detail={text.t('musicVolumeValue', { value: Math.round(audio.musicVolume * 100) })} />
            <input
              aria-label={text.t('musicVolume')}
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={audio.musicVolume}
              disabled={!audio.musicEnabled}
              onChange={(event) => onAudio({ ...audio, musicVolume: Number(event.target.value) })}
            />
          </label>
          <Toggle title={text.t('soundEffects')} detail={text.t('soundEffectsDetail')} checked={audio.effectsEnabled} onChange={(value) => onAudio({ ...audio, effectsEnabled: value })} />
          {vibrationSupported && (
            <Toggle title={text.t('haptics')} detail={text.t('hapticsDetail')} checked={game.haptics} onChange={(value) => onGame((s) => ({ ...s, haptics: value }))} />
          )}
        </Section>
        <Section title={text.t('sectionAccessibility')}>
          <Toggle
            title={text.t('reduceMotion')}
            detail={systemReduce ? text.t('reduceMotionSystem') : text.t('reduceMotionDetail')}
            checked={game.reduceMotion || systemReduce}
            disabled={systemReduce}
            onChange={(value) => onGame((s) => ({ ...s, reduceMotion: value }))}
          />
        </Section>
        <Section title={text.t('sectionLanguage')}>
          <div className="settings-row">
            <RowText title={text.t('language')} />
            <div className="language-segments" role="group" aria-label={text.t('language')}>
              <button type="button" aria-pressed={language === 'en'} onClick={() => onLanguage('en')}>{text.t('english')}</button>
              <button type="button" aria-pressed={language === 'ru'} onClick={() => onLanguage('ru')}>{text.t('russian')}</button>
            </div>
          </div>
        </Section>
        {webExtras && (
          <Section title={text.t('sectionPrivacy')}>
            <a className="settings-row link" href="./privacy.html">
              <RowText title={text.t('privacyPolicy')} detail={text.t('privacyPolicyDetail')} />
              <Icon name="chevronRightRounded" size={24} color="#7A808C" />
            </a>
            <Toggle title={text.t('anonymousAnalytics')} detail={text.t('anonymousAnalyticsDetail')} checked={analyticsEnabled} onChange={onAnalytics} />
          </Section>
        )}
        <Section title={text.t('sectionHelp')}>
          <button type="button" className="settings-row link" onClick={onHowToPlay}>
            <RowText title={text.t('howToPlay')} />
            <Icon name="chevronRightRounded" size={24} color="#7A808C" />
          </button>
        </Section>
        <Section title={text.t('sectionAbout')}>
          <div className="settings-row">
            <RowText title={text.t('version')} />
            <span className="row-detail">{__APP_VERSION__}</span>
          </div>
        </Section>
      </div>
    </ScreenFrame>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="settings-section">
      <h2 className="section-label">{title}</h2>
      <div className="settings-plate">{children}</div>
    </section>
  )
}

function RowText({ title, detail }: { title: string; detail?: string }) {
  return (
    <span className="row-text">
      <span className="row-title">{title}</span>
      {detail && <span className="row-detail">{detail}</span>}
    </span>
  )
}

function Toggle({ title, detail, checked, disabled = false, onChange }: { title: string; detail?: string; checked: boolean; disabled?: boolean; onChange: (value: boolean) => void }) {
  return (
    <label className="settings-row">
      <RowText title={title} detail={detail} />
      <input className="q-switch" type="checkbox" role="switch" checked={checked} disabled={disabled} onChange={(event) => onChange(event.target.checked)} />
    </label>
  )
}
