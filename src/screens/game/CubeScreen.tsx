import { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react'
import { trackGoal } from '../../analytics/metrika'
import { gameAudio } from '../../audio/audioService'
import { RollDiceButton, SecondaryAction } from '../../components/ui'
import { useAppearance } from '../../cosmetics/appearance'
import type { CubeFormat } from '../../cube/generator'
import { rectHeight, rectWidth, type Rect } from '../../cube/geometry'
import type { CubePlacement } from '../../cube/model'
import type { CubeSession } from '../../cube/session'
import { CubeRepository, DailyCubeRepository } from '../../cube/storage'
import { feel } from '../../feel/haptics'
import { formatClock, useText } from '../../i18n/text'
import { platform } from '../../platform'
import type { CompletionAward } from '../../progress/playerProgress'
import { prefersReducedMotion, type CubeViewPart, type GameSettings } from '../../settings/gameSettings'
import { prepareCanvas } from '../../rendering/canvas'
import { CubePieceBar, CubeTopBar } from './CubeControls'
import { CubeController, layoutFor, type CubeServices } from './cubeController'
import { CubeHelp } from './cubeHelp'
import { ConfirmSheet, GameMenuSheet, ResultPanel, RewardedOfferSheet, type GameMenuAction } from './GameSheets'
import { SolutionScreen } from './SolutionScreen'

type SheetState =
  | { kind: 'menu' }
  | { kind: 'confirmRestart' }
  | { kind: 'confirmNew' }
  | { kind: 'offer'; type: 'hint' | 'solution' }

/** The canvases never need more than this many pixels per CSS pixel. */
const maxPixelRatio = 2

/**
 * The game (mobile `CubeScreen`): opens on an empty cube with "Roll Dice"
 * for a new puzzle, or straight in play for the saved one. Turn the cube,
 * carry pieces in from the tray, fine-tune them with the arrow handles and
 * look through the pieces to find the free cells. The behaviour lives in
 * [CubeController]; this shows it, portrait (as on the phone) or landscape
 * (the tray in a panel beside the cube).
 */
export function CubeScreen({ session, dailyDate, format, settings, onSettings, covered, onSolved, onMainMenu, onOpenPage, onLeaveDaily }: {
  session: CubeSession
  /** Set for the daily cube, which is saved apart from the everyday one. */
  dailyDate: Date | null
  /** The cube to throw when none is in play (the menu's choice). */
  format?: CubeFormat
  settings: GameSettings
  onSettings: (update: (settings: GameSettings) => GameSettings) => void
  /** Another page (settings, how to play) is open over the game. */
  covered: boolean
  onSolved: (session: CubeSession) => CompletionAward | null
  onMainMenu: () => void
  onOpenPage: (page: 'howto' | 'settings') => void
  /** "New puzzle" on the daily cube leaves it for a fresh everyday one. */
  onLeaveDaily: () => void
}) {
  const text = useText()
  const skins = useAppearance()
  const save = useCallback(() => {
    if (dailyDate) DailyCubeRepository.save(dailyDate, session)
    else CubeRepository.saveSession(session)
  }, [dailyDate, session])

  // What the controller asks of the app, always with the latest settings.
  const services: CubeServices = {
    play: (effect) => gameAudio.playEffect(effect),
    feel: (haptic) => feel(haptic, settings.haptics),
    cubeView: (part) => settings.cubeView[part],
    hasLearned: (tip) => settings.learned.includes(tip),
    markLearned: (tip) => {
      if (settings.learned.includes(tip)) return
      onSettings((s) => (s.learned.includes(tip) ? s : { ...s, learned: [...s.learned, tip] }))
    },
    reduceMotion: () => prefersReducedMotion(settings),
    save,
    onSolved: () => onSolved(session),
  }
  const [controller] = useState(() => new CubeController(session, services, { daily: dailyDate !== null, format }))
  useLayoutEffect(() => controller.setServices(services))
  const [help] = useState(() => new CubeHelp(session, save))
  useSyncExternalStore(useCallback((listener) => controller.subscribe(listener), [controller]), () => controller.version)

  const [sheet, setSheet] = useState<SheetState | null>(null)
  const [solution, setSolution] = useState<CubePlacement[] | null>(null)
  const paused = sheet !== null || solution !== null || covered

  useEffect(() => controller.attach(), [controller])
  useEffect(() => {
    controller.setText((key) => text.t(key))
  }, [controller, text])

  // A sheet or a page over the game stops the clock and the cube's input.
  useEffect(() => {
    if (paused) controller.openSheet()
    else controller.closeSheet()
    gameAudio.setMenuOpen(paused)
  }, [controller, paused])
  useEffect(() => () => gameAudio.setMenuOpen(false), [])

  // Hidden tab or a platform pause (ads, dialogs): the clock waits.
  useEffect(() => {
    const onVisibility = () => (document.hidden ? controller.suspend() : controller.resumeIfIdle())
    document.addEventListener('visibilitychange', onVisibility)
    const offPause = platform.onPauseChange((on) => (on ? controller.suspend() : controller.resumeIfIdle()))
    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      offPause()
    }
  }, [controller])

  useEffect(() => {
    platform.setGameplayActive(controller.playable && !paused)
  })
  useEffect(() => () => platform.setGameplayActive(false), [])

  // Skins and display options are drawn: repaint when they change.
  useEffect(() => controller.markDirty(), [controller, skins, settings, covered])

  // Layout follows the screen.
  const stage = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const node = stage.current
    if (!node) return
    const update = () => controller.setLayout(layoutFor(node.clientWidth, node.clientHeight))
    update()
    const observer = new ResizeObserver(update)
    observer.observe(node)
    return () => observer.disconnect()
  }, [controller])

  // The frame loop: animations step, canvases repaint when anything moved.
  const cubeCanvas = useRef<HTMLCanvasElement>(null)
  const trayCanvas = useRef<HTMLCanvasElement>(null)
  const toolbar = useRef<HTMLDivElement>(null)
  const skinsRef = useRef(skins)
  const coveredRef = useRef(covered)
  useLayoutEffect(() => {
    skinsRef.current = skins
    coveredRef.current = covered
  })
  useEffect(() => {
    let frame = 0
    const loop = (now: number) => {
      frame = requestAnimationFrame(loop)
      if (!controller.tick(now) || coveredRef.current) return
      const ratio = Math.min(maxPixelRatio, window.devicePixelRatio || 1)
      const layout = controller.layout
      const cube = cubeCanvas.current
      if (cube) {
        const ctx = prepareCanvas(cube, layout.width, layout.height, 0, ratio)
        if (ctx) controller.paintCube(ctx, skinsRef.current)
      }
      const tray = trayCanvas.current
      const area = controller.trayArea
      if (tray && area) {
        const ctx = prepareCanvas(tray, rectWidth(area), rectHeight(area), 0, ratio)
        if (ctx) controller.paintTray(ctx, skinsRef.current)
        tray.style.opacity = String(controller.trayOpacity)
      }
      if (toolbar.current) toolbar.current.style.opacity = String(controller.trayOpacity)
    }
    frame = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(frame)
  }, [controller])

  // Pointers: everything on the stage except its buttons.
  const local = (e: ReactPointerEvent) => {
    const box = stage.current!.getBoundingClientRect()
    return { x: e.clientX - box.left, y: e.clientY - box.top }
  }
  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('button, a, input, [data-ui]')) return
    if (e.button !== 0 && e.pointerType === 'mouse') return
    try {
      stage.current!.setPointerCapture(e.pointerId)
    } catch {
      // A pointer the browser no longer tracks: moves still bubble here.
    }
    controller.pointerDown(e.pointerId, local(e))
  }
  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => controller.pointerMove(e.pointerId, local(e), e.timeStamp)
  const onPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => controller.pointerUp(e.pointerId, local(e), e.timeStamp)

  // The wheel turns the cube on desktop.
  useEffect(() => {
    const node = stage.current
    if (!node) return
    const onWheel = (event: WheelEvent) => {
      if ((event.target as HTMLElement).closest('[data-ui]')) return
      event.preventDefault()
      controller.wheel(event.deltaX, event.deltaY)
    }
    node.addEventListener('wheel', onWheel, { passive: false })
    return () => node.removeEventListener('wheel', onWheel)
  }, [controller])

  // ---- Hints and help -----------------------------------------------------

  const offerHint = () => {
    // Without videos on this platform the next hint is simply given.
    if (!platform.rewardedAds) {
      if (session.hints.grantRewardedHint()) save()
      return
    }
    setSheet({ kind: 'offer', type: 'hint' })
  }

  const requestHint = () => {
    const result = controller.requestHint()
    if (result === 'shown') trackGoal('hint_shown', { mode: dailyDate ? 'daily' : 'normal', free_remaining: session.hints.freeRemaining })
    else if (result === 'noFreeHints') offerHint()
  }

  const openSolution = () => setSolution(controller.solutionFor())

  const viewSolution = () => {
    if (session.solutionUnlocked) return openSolution()
    if (!platform.rewardedAds) {
      session.unlockSolution()
      save()
      return openSolution()
    }
    setSheet({ kind: 'offer', type: 'solution' })
  }

  const newPuzzle = () => {
    setSheet(null)
    if (dailyDate) return onLeaveDaily()
    controller.newPuzzle()
  }

  const choose = (action: GameMenuAction) => {
    switch (action) {
      case 'resume':
        return setSheet(null)
      case 'restart':
        return setSheet({ kind: 'confirmRestart' })
      case 'newPuzzle':
        return session.isResumable ? setSheet({ kind: 'confirmNew' }) : newPuzzle()
      case 'viewSolution':
        setSheet(null)
        return viewSolution()
      case 'howToPlay':
      case 'settings':
        setSheet(null)
        return onOpenPage(action === 'howToPlay' ? 'howto' : 'settings')
      case 'mainMenu':
        setSheet(null)
        return onMainMenu()
      case 'autoSolve':
        setSheet(null)
        return controller.autoSolve()
    }
  }

  const openMenu = () => {
    if (controller.phase === 'rolling' || paused) return
    setSheet({ kind: 'menu' })
  }

  // Desktop keys: Escape opens the menu, Ctrl/Cmd+Z takes a move back.
  useEffect(() => {
    if (paused) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !document.querySelector('.cube-display-scrim')) {
        event.preventDefault()
        openMenu()
      } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z' && controller.canUndo) {
        event.preventDefault()
        controller.undo()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  // ---- Showing it ---------------------------------------------------------

  const layout = controller.layout
  const game = session.game
  const playable = controller.playable
  const phase = controller.phase
  const trayArea = controller.trayArea
  const edges = controller.trayEdges
  const status = (() => {
    const size = controller.size
    const cube = dailyDate ? `${text.t('dailyChallenge')} · ${text.cubeSize(size)}` : `${text.formatName(size)} · ${text.cubeSize(size)}`
    if (!game.hasPuzzle) return cube
    return `${cube} · ${text.t('progress', { placed: game.placements.length, total: session.pieceCount })} · ${formatClock(session.elapsedMs)}`
  })()

  return (
    <main className={`game-root cube-root${layout.landscape ? ' landscape' : ''}`}>
      <div className="app-backdrop" aria-hidden="true" />
      <div
        ref={stage}
        className="cube-stage"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onContextMenu={(e) => e.preventDefault()}
      >
        <div className="cube-layer" style={box(layout.header)} data-ui>
          <CubeTopBar
            session={session}
            tools={playable}
            hintShown={session.hints.active !== null}
            freeHints={session.hints.freeRemaining}
            hintVideo={platform.rewardedAds}
            xray={controller.xray}
            layers={controller.layersOn}
            cubeView={settings.cubeView}
            onCubeView={(part: CubeViewPart, on: boolean) => onSettings((s) => ({ ...s, cubeView: { ...s.cubeView, [part]: on } }))}
            onHint={requestHint}
            onXray={() => controller.toggleXray()}
            onLayers={() => controller.toggleLayers()}
            onResetView={() => controller.resetView()}
            onMenu={phase === 'rolling' ? null : openMenu}
          />
        </div>
        {playable && (
          <div ref={toolbar} className="cube-layer" style={{ ...box(layout.toolbar), opacity: controller.trayOpacity }} data-ui>
            <CubePieceBar
              selected={controller.selected !== null && !controller.carrying}
              placed={controller.selectedPlaced}
              canUndo={controller.canUndo}
              onUndo={() => controller.undo()}
              onTurn={() => controller.transform('turn')}
              onTilt={() => controller.transform('tilt')}
              onSpin={() => controller.transform('spin')}
              onTray={() => controller.toTray()}
              onDone={() => controller.done()}
            />
          </div>
        )}
        {phase !== 'readyToRoll' && !controller.solved && (
          <p className="cube-caption" style={box(layout.caption)} aria-live="polite">{controller.caption(text.t)}</p>
        )}
        {trayArea && playable && (
          <canvas
            ref={trayCanvas}
            className="cube-tray"
            aria-hidden="true"
            style={{ ...box(trayArea), opacity: controller.trayOpacity, ...trayMask(edges.left, edges.right) }}
          />
        )}
        <canvas ref={cubeCanvas} className="cube-canvas" aria-label={text.cubeSize(controller.size)} role="img" style={{ width: layout.width, height: layout.height }} />
        {phase === 'readyToRoll' && (
          <div className="cube-prompt" style={box(layout.prompt)} data-ui>
            <RollDiceButton label={text.t('rollDice')} enabled onPress={() => controller.rollDice()} dice={skins.dice} />
            <p className="caption">{text.t('diceFill')}</p>
          </div>
        )}
        {controller.solved && controller.resultReady && (
          <div className="cube-completion" style={box(layout.result)} data-ui>
            {controller.viewingCube ? (
              <div className="result-back">
                <SecondaryAction label={text.t('backToResults')} icon="expandLessRounded" compact onPress={() => controller.setViewingCube(false)} />
              </div>
            ) : (
              <ResultPanel
                timeMs={session.solvedInMs}
                award={controller.award}
                assistanceUsed={session.assistanceUsed}
                compact={rectHeight(layout.result) < 236}
                onNewPuzzle={newPuzzle}
                onViewBoard={() => controller.setViewingCube(true)}
                onMainMenu={onMainMenu}
              />
            )}
          </div>
        )}
      </div>

      {sheet?.kind === 'menu' && (
        <GameMenuSheet
          status={status}
          canRestart={playable && game.placements.length > 0}
          canViewSolution={playable}
          solutionLocked={platform.rewardedAds && !session.solutionUnlocked}
          developer={import.meta.env.DEV}
          onChoose={choose}
        />
      )}
      {sheet?.kind === 'confirmRestart' && (
        <ConfirmSheet
          title={text.t('restartTitle')}
          body={text.t('restartBody')}
          confirm={text.t('restart')}
          onConfirm={() => {
            setSheet(null)
            controller.restartPuzzle()
          }}
          onCancel={() => setSheet(null)}
        />
      )}
      {sheet?.kind === 'confirmNew' && (
        <ConfirmSheet title={text.t('newPuzzleTitle')} body={text.t('newPuzzleBody')} confirm={text.t('newPuzzle')} onConfirm={newPuzzle} onCancel={() => setSheet(null)} />
      )}
      {sheet?.kind === 'offer' && (
        <RewardedOfferSheet
          kind={sheet.type}
          watch={() => (sheet.type === 'hint' ? help.watchForHint() : help.watchForSolution())}
          onClose={(granted) => {
            const type = sheet.type
            setSheet(null)
            if (granted && type === 'solution') openSolution()
            if (granted && type === 'hint') trackGoal('hint_shown', { mode: dailyDate ? 'daily' : 'normal', source: help.lastHintWasFallback ? 'ad_fallback' : 'rewarded' })
          }}
        />
      )}
      {solution && game.hasPuzzle && (
        <div className="cube-page">
          <SolutionScreen level={game.level} solution={solution} placed={new Set(game.placements.map((p) => p.pieceId))} onBack={() => setSolution(null)} />
        </div>
      )}
    </main>
  )
}

function box(r: Rect): CSSProperties {
  return { left: r.left, top: r.top, width: rectWidth(r), height: rectHeight(r) }
}

/** Fades the tray's edges where more pieces wait off screen. */
function trayMask(left: boolean, right: boolean): CSSProperties {
  if (!left && !right) return {}
  const mask = `linear-gradient(to right, ${left ? 'transparent' : '#000'} 0%, #000 8%, #000 92%, ${right ? 'transparent' : '#000'} 100%)`
  return { maskImage: mask, WebkitMaskImage: mask }
}
