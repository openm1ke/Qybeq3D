import { useEffect, useRef, useState, type ReactNode } from 'react'
import { CubePicture } from '../components/CubePicture'
import { sampleDice, sampleParts } from '../cube/samples'
import { Icon } from '../components/Icon'
import { ScreenFrame } from '../components/ScreenFrame'
import { TrayPiece } from '../components/TrayPiece'
import { PrimaryAction, QuietAction, SecondaryAction, Sheet } from '../components/ui'
import { AppearanceContext, isItemUnlocked, matchesPreset, presetAppearance, withItem, type Appearance } from '../cosmetics/appearance'
import { itemsFor, presets, type CosmeticItem, type CosmeticSlot, type ThemePreset } from '../cosmetics/skins'
import { CubePieces, Voxel } from '../cube/model'
import { useText } from '../i18n/text'

/** Pieces shown in the preview cube: enough to see pieces, dice and the
 * plate at once. */
const previewParts = sampleParts.slice(0, 4)
const twoDice = [new Voxel(0, 0, 1), new Voxel(1, 0, 0)]

/**
 * Pieces, dice and board, each chosen on its own or together as a theme
 * (mobile `CustomizeScreen`). Every preview is drawn by the game's own cube
 * renderer with the skins it shows.
 */
export function CustomizeScreen({ appearance, stars, owned, onChange, onPurchase, onBack }: {
  appearance: Appearance
  stars: number
  owned: ReadonlySet<string>
  onChange: (appearance: Appearance, source: string) => void
  onPurchase: (preset: ThemePreset) => boolean
  onBack: () => void
}) {
  const text = useText()
  const [slot, setSlot] = useState<CosmeticSlot>('pieces')
  const [confirming, setConfirming] = useState<ThemePreset | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const width = window.innerWidth
  const height = window.innerHeight
  const content = Math.min(width, 640) - 40
  const preview = Math.min(width >= 600 ? 300 : 240, content - 24, height * 0.34)
  const classic = presets[0]
  const presetName = (preset: ThemePreset) => text.presetName(preset.id, preset.name)
  const name = (item: CosmeticItem) => text.cosmeticName(item.id, item.name)

  useEffect(() => {
    if (!notice) return
    const timer = window.setTimeout(() => setNotice(null), 2600)
    return () => window.clearTimeout(timer)
  }, [notice])

  const choosePreset = (preset: ThemePreset) => {
    if (preset.price === 0 || owned.has(preset.id)) return onChange(presetAppearance(preset), 'preset')
    if (stars < preset.price) return setNotice(text.t('notEnoughStars'))
    setConfirming(preset)
  }

  return (
    <ScreenFrame title={text.t('customize')} backLabel={text.t('back')} onBack={onBack}>
      <div className="customize-body" style={{ width: content }}>
        <div
          className="live-preview"
          role="img"
          aria-label={text.t('previewSemantics', { piecesName: name(appearance.pieces), diceName: name(appearance.dice), boardName: name(appearance.board) })}
          style={{ width: preview, height: preview }}
        >
          <AppearanceContext.Provider value={appearance}>
            <div key={`${appearance.pieces.id}/${appearance.dice.id}/${appearance.board.id}`} className="live-preview-fade">
              <CubePicture extent={preview} dice={sampleDice} parts={previewParts} bounds={false} />
            </div>
          </AppearanceContext.Provider>
        </div>
        <div className="balance-chip">
          <Icon name="starRounded" size={20} color="#5B8CFF" />
          <span>{text.t('starBalance', { count: stars })}</span>
        </div>

        <div className="section-row">
          <h2 className="section-label">{text.t('presets')}</h2>
          <span className="caption">{text.t('swipeThemes')}</span>
        </div>
        <PresetStrip appearance={appearance}>
          {presets.map((preset) => {
            const selected = matchesPreset(appearance, preset)
            const locked = preset.price > 0 && !owned.has(preset.id)
            return (
              <ChoiceCard
                key={preset.id}
                className="preset-card"
                title={presetName(preset)}
                ariaLabel={text.t('presetSemantics', { name: presetName(preset), state: selected ? (text.language === 'ru' ? ', выбрано' : ', selected') : '' })}
                selected={selected}
                locked={locked}
                lockedLabel={stars >= preset.price ? text.t('unlockFor', { price: preset.price }) : text.t('priceProgress', { current: stars, price: preset.price })}
                onPress={() => choosePreset(preset)}
                preview={
                  <AppearanceContext.Provider value={presetAppearance(preset)}>
                    <CubePicture extent={72} dice={sampleDice} parts={previewParts} bounds={false} />
                  </AppearanceContext.Provider>
                }
              />
            )
          })}
        </PresetStrip>

        <div className="slot-tabs" role="tablist">
          {(['pieces', 'dice', 'board'] as const).map((value) => (
            <button key={value} type="button" role="tab" aria-selected={value === slot} className={value === slot ? 'selected' : ''} onClick={() => setSlot(value)}>
              {text.t(value)}
            </button>
          ))}
        </div>

        <div className="skin-grid">
          {itemsFor(slot).map((item) => {
            const selected = appearance[item.slot].id === item.id
            const locked = !isItemUnlocked(item, owned)
            const states = [selected ? (text.language === 'ru' ? 'выбрано' : 'selected') : null, locked ? (text.language === 'ru' ? 'закрыто' : 'locked') : null].filter(Boolean)
            return (
              <ChoiceCard
                key={item.id}
                title={name(item)}
                ariaLabel={text.t('skinSemantics', { name: name(item), kind: text.kind(item.slot), state: states.length ? `, ${states.join(', ')}` : '' })}
                selected={selected}
                locked={locked}
                lockedLabel={text.t('locked')}
                lockedActionable={false}
                onPress={() => onChange(withItem(appearance, item), item.slot)}
                preview={
                  <AppearanceContext.Provider value={withItem(appearance, item)}>
                    <SkinSample slot={item.slot} />
                  </AppearanceContext.Provider>
                }
              />
            )
          })}
        </div>

        <div className="reset-row">
          <QuietAction label={text.t('resetToClassic')} icon="restartAltRounded" onPress={matchesPreset(appearance, classic) ? undefined : () => onChange(presetAppearance(classic), 'reset')} />
        </div>
      </div>

      {notice && <div className="q-toast" role="status">{notice}</div>}
      {confirming && (
        <Sheet label={text.t('unlockThemeTitle', { name: presetName(confirming) })} onDismiss={() => setConfirming(null)}>
          <h2 className="sheet-title">{text.t('unlockThemeTitle', { name: presetName(confirming) })}</h2>
          <p className="sheet-body">{text.t('unlockThemeBody', { price: confirming.price, balanceAfter: stars - confirming.price })}</p>
          <div className="sheet-actions">
            <PrimaryAction
              label={text.t('unlock')}
              compact
              onPress={() => {
                const preset = confirming
                setConfirming(null)
                if (onPurchase(preset)) onChange(presetAppearance(preset), 'purchase')
              }}
            />
            <SecondaryAction label={text.t('cancel')} compact onPress={() => setConfirming(null)} />
          </div>
        </Sheet>
      )}
    </ScreenFrame>
  )
}

/** The themes in a sideways strip, opened at the selected one. */
function PresetStrip({ appearance, children }: { appearance: Appearance; children: ReactNode }) {
  const strip = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const node = strip.current
    if (!node) return
    const selected = presets.findIndex((p) => matchesPreset(appearance, p))
    const card = node.children[Math.max(0, selected - 1)] as HTMLElement | undefined
    if (card) node.scrollLeft = card.offsetLeft - node.offsetLeft
    // Only where it opens; afterwards the player scrolls.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return <div ref={strip} className="preset-strip">{children}</div>
}

/** The skin drawn by its real renderer, the other slots as they are now. */
function SkinSample({ slot }: { slot: CosmeticSlot }) {
  if (slot === 'dice') return <CubePicture extent={72} size={2} dice={twoDice} plate={false} bounds={false} />
  if (slot === 'board') return <CubePicture extent={72} dice={sampleDice} bounds={false} />
  return (
    <span className="sample-row">
      {[CubePieces.ell, CubePieces.tee, CubePieces.tripod].map((p) => <TrayPiece key={p.id} shape={p.cells} colorKey={p.colorKey} size={44} />)}
    </span>
  )
}

/** One option (a skin, a theme): a plate that lights up with an accent
 * border, a check and the word "Selected" — never colour alone. */
function ChoiceCard({ title, ariaLabel, preview, selected, locked, lockedLabel, lockedActionable = true, onPress, className }: {
  title: string
  ariaLabel: string
  preview: ReactNode
  selected: boolean
  locked: boolean
  lockedLabel: string
  lockedActionable?: boolean
  onPress: () => void
  className?: string
}) {
  const text = useText()
  return (
    <button
      type="button"
      className={['choice-card', selected ? 'selected' : '', locked ? 'locked' : '', className].filter(Boolean).join(' ')}
      aria-label={ariaLabel}
      aria-pressed={selected}
      disabled={locked && !lockedActionable}
      onClick={onPress}
    >
      <span className="choice-preview">{preview}</span>
      <span className="choice-title">{title}</span>
      <span className="choice-status">
        {selected ? (
          <><Icon name="checkCircleRounded" size={15} color="#5B8CFF" /><span className="accent">{text.t('selected')}</span></>
        ) : locked ? (
          <><Icon name="lockRounded" size={15} color="#7A808C" /><span>{lockedLabel}</span></>
        ) : null}
      </span>
    </button>
  )
}
