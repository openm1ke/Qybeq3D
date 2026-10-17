import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { Icon, type IconName } from '../../components/Icon'
import type { CubeSession } from '../../cube/session'
import { formatClock, useText } from '../../i18n/text'
import type { CubeViewPart } from '../../settings/gameSettings'

/**
 * The cube screen's controls (mobile `cube_controls.dart`): the service row
 * above the cube and the piece tools beside the tray.
 */

/** The row above the cube: the clock, then hint, see-through, layers,
 * display options and the pause menu. Nothing else, so the cube gets the
 * room. */
export function CubeTopBar({ session, tools, hintShown, freeHints, hintVideo, xray, layers, cubeView, onCubeView, onHint, onXray, onLayers, onResetView, onMenu }: {
  session: CubeSession
  tools: boolean
  hintShown: boolean
  freeHints: number
  /** With no free hints left, the next one comes with a video. */
  hintVideo: boolean
  xray: boolean
  layers: boolean
  cubeView: Readonly<Record<CubeViewPart, boolean>>
  onCubeView: (part: CubeViewPart, on: boolean) => void
  onHint: () => void
  onXray: () => void
  onLayers: () => void
  onResetView: () => void
  onMenu: (() => void) | null
}) {
  const text = useText()
  const row = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(1)
  // On the narrowest phones the buttons shrink a little rather than
  // overflow; the clock keeps its size.
  useLayoutEffect(() => {
    const node = row.current
    if (!node) return
    const fit = () => {
      const room = node.parentElement!.clientWidth
      const natural = node.scrollWidth
      setScale(natural > room ? room / natural : 1)
    }
    fit()
    const observer = new ResizeObserver(fit)
    observer.observe(node.parentElement!)
    return () => observer.disconnect()
  }, [tools])
  return (
    <div className="cube-top-bar">
      <CubeClock session={session} />
      <div className="cube-top-tools">
        <div ref={row} className="cube-top-row" style={{ transform: scale < 1 ? `scale(${scale})` : undefined }}>
          {tools && (
            <>
              <RoundButton
                icon={hintShown ? 'lightbulbRounded' : 'lightbulbOutlineRounded'}
                label={text.t('toolHint')}
                ariaLabel={text.hintsLeft(freeHints)}
                active={hintShown}
                badge={freeHints > 0 ? <span className="cube-badge">{freeHints}</span> : hintVideo ? <span className="cube-badge"><Icon name="playArrowRounded" size={12} /></span> : null}
                onPress={onHint}
                testId="cube-hint"
              />
              <RoundButton icon="visibilityOutlined" label={text.t('toolSeeThrough')} active={xray} onPress={onXray} />
              <RoundButton icon="layersOutlined" label={text.t('toolLayers')} active={layers} onPress={onLayers} />
              <DisplayButton cubeView={cubeView} onCubeView={onCubeView} onResetView={onResetView} />
            </>
          )}
          <RoundButton icon="pauseRounded" label={text.t('gameMenu')} onPress={onMenu} testId="cube-menu" />
        </div>
      </div>
    </div>
  )
}

/** "--:--" until the dice have settled, then mm:ss of active play. */
export function CubeClock({ session }: { session: CubeSession }) {
  const [, setTick] = useState(0)
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (session.clockRunning) setTick((t) => t + 1)
    }, 1000)
    return () => window.clearInterval(timer)
  }, [session])
  return (
    <div className="cube-clock">
      <Icon name="timerOutlined" size={15} />
      <span>{session.clockStarted ? formatClock(session.elapsedMs) : '--:--'}</span>
    </div>
  )
}

/** A round icon button of the top bar, with an "on" state and an optional
 * corner badge. */
function RoundButton({ icon, label, ariaLabel, active = false, badge, onPress, testId }: {
  icon: IconName
  label: string
  ariaLabel?: string
  active?: boolean
  badge?: ReactNode
  onPress: (() => void) | null
  testId?: string
}) {
  return (
    <button
      type="button"
      className={`cube-round${active ? ' active' : ''}`}
      title={label}
      aria-label={ariaLabel ?? label}
      aria-pressed={active || undefined}
      disabled={!onPress}
      onClick={onPress ?? undefined}
      data-testid={testId}
    >
      <Icon name={icon} size={21} />
      {badge}
    </button>
  )
}

/** What the cube shows besides the pieces, and a way back to the resting
 * view. The panel stays open while switching; tapping outside closes it. */
function DisplayButton({ cubeView, onCubeView, onResetView }: {
  cubeView: Readonly<Record<CubeViewPart, boolean>>
  onCubeView: (part: CubeViewPart, on: boolean) => void
  onResetView: () => void
}) {
  const text = useText()
  const button = useRef<HTMLButtonElement>(null)
  const [anchor, setAnchor] = useState<DOMRect | null>(null)
  const close = () => setAnchor(null)
  useEffect(() => {
    if (!anchor) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [anchor])
  const parts: [CubeViewPart, string][] = [
    ['freeCells', text.t('showFreeCells')],
    ['grid', text.t('showGrid')],
    ['edges', text.t('showEdges')],
    ['plate', text.t('showPlate')],
  ]
  return (
    <>
      <button
        ref={button}
        type="button"
        className="cube-round"
        title={text.t('toolDisplay')}
        aria-label={text.t('toolDisplay')}
        aria-expanded={anchor !== null}
        onClick={() => setAnchor(button.current!.getBoundingClientRect())}
      >
        <Icon name="tuneRounded" size={21} />
      </button>
      {anchor && (
        <div className="cube-display-scrim" onClick={close} role="presentation">
          <div
            className="cube-display-panel"
            role="dialog"
            aria-label={text.t('toolDisplay')}
            style={{ top: anchor.bottom + 8, right: Math.max(8, window.innerWidth - anchor.right) }}
            onClick={(event) => event.stopPropagation()}
          >
            {parts.map(([part, label]) => (
              <button key={part} type="button" className="cube-panel-row" role="menuitemcheckbox" aria-checked={cubeView[part]} onClick={() => onCubeView(part, !cubeView[part])}>
                <span className={`cube-check${cubeView[part] ? ' on' : ''}`} aria-hidden="true"><Icon name="checkRounded" size={16} /></span>
                <span>{label}</span>
              </button>
            ))}
            <i className="cube-panel-divider" />
            <button type="button" className="cube-panel-row" onClick={() => { onResetView(); close() }}>
              <span className="cube-panel-icon" aria-hidden="true"><Icon name="centerFocusStrongOutlined" size={20} /></span>
              <span>{text.t('resetView')}</span>
            </button>
          </div>
        </div>
      )}
    </>
  )
}

/** The piece tools under the cube, next to the tray. Always in the same
 * place; they come alive once a piece is picked. */
export function CubePieceBar({ selected, placed, canUndo, onUndo, onTurn, onTilt, onSpin, onTray, onDone }: {
  selected: boolean
  placed: boolean
  canUndo: boolean
  onUndo: () => void
  onTurn: () => void
  onTilt: () => void
  onSpin: () => void
  onTray: () => void
  onDone: () => void
}) {
  const text = useText()
  const row = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(1)
  // Full size from 390 px wide; a little smaller on the narrowest phones.
  useLayoutEffect(() => {
    const node = row.current
    if (!node) return
    const fit = () => {
      const room = node.parentElement!.clientWidth
      setScale(node.scrollWidth > room ? room / node.scrollWidth : 1)
    }
    fit()
    const observer = new ResizeObserver(fit)
    observer.observe(node.parentElement!)
    return () => observer.disconnect()
  }, [])
  const tools: [IconName, string, () => void][] = [
    ['rotateRightRounded', text.t('pieceTurn'), onTurn],
    ['screenRotationAltRounded', text.t('pieceTilt'), onTilt],
    ['threesixtyRounded', text.t('pieceSpin'), onSpin],
  ]
  return (
    <div className="cube-piece-bar">
      <div ref={row} className="cube-piece-row" style={{ transform: scale < 1 ? `scale(${scale})` : undefined }}>
        <Pill icon="undoRounded" label={text.t('undo')} onPress={canUndo ? onUndo : null} />
        <div className={`cube-tools${selected ? ' enabled' : ''}`}>
          {tools.map(([icon, label, onPress], i) => (
            <span key={label} className="cube-tool-wrap">
              {i > 0 && <i className="cube-tool-divider" />}
              <button type="button" className="cube-tool" disabled={!selected} onClick={onPress}>
                <Icon name={icon} size={16} />
                <span>{label}</span>
              </button>
            </span>
          ))}
        </div>
        <Pill icon="downloadRounded" label={text.t('pieceToTray')} onPress={placed ? onTray : null} />
        <Pill icon="checkRounded" label={text.t('done')} onPress={selected ? onDone : null} active={selected} />
      </div>
    </div>
  )
}

/** The game's stadium buttons with an "on" state; without a visible label
 * a round icon button named by [label]. */
function Pill({ icon, label, onPress, active = false }: { icon: IconName; label: string; onPress: (() => void) | null; active?: boolean }) {
  return (
    <button type="button" className={`cube-pill${active ? ' active' : ''}`} title={label} aria-label={label} disabled={!onPress} onClick={onPress ?? undefined}>
      <Icon name={icon} size={17} />
    </button>
  )
}
