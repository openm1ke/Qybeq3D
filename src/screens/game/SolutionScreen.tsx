import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Icon } from '../../components/Icon'
import { ScreenFrame } from '../../components/ScreenFrame'
import { PrimaryAction, QuietAction, SecondaryAction } from '../../components/ui'
import { useAppearance } from '../../cosmetics/appearance'
import { CubeCamera } from '../../cube/camera'
import type { CubeLevel, CubePlacement } from '../../cube/model'
import { paintCube } from '../../cube/painter'
import { CubeScene, Solid } from '../../cube/scene'
import { useText } from '../../i18n/text'
import { prepareCanvas } from '../../rendering/canvas'

const interval = 900

/**
 * A full solution of the current cube, one piece at a time (mobile
 * `CubeSolutionScreen` and `SolutionController`). It only shows data: the
 * player's cube is not touched. Pieces the player already has in place come
 * first. Step 0 is the empty cube, the last step the finished one.
 */
export function SolutionScreen({ level, solution, placed, onBack }: {
  level: CubeLevel
  solution: readonly CubePlacement[]
  placed: ReadonlySet<string>
  onBack: () => void
}) {
  const text = useText()
  const skins = useAppearance()
  const order = useMemo(
    () => [...solution.filter((p) => placed.has(p.pieceId)), ...solution.filter((p) => !placed.has(p.pieceId))],
    [solution, placed],
  )
  const total = order.length
  const [step, setStep] = useState(0)
  const [autoPlay, setPlaying] = useState(false)
  const playing = autoPlay && step < total
  const [, setView] = useState(0)
  const camera = useRef(new CubeCamera()).current
  const box = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const [size, setSize] = useState({ width: 0, height: 0 })
  const drag = useRef<{ id: number; x: number; y: number } | null>(null)

  // Auto-play: the next piece at once, then one per interval; it stops by
  // itself on the last step. Manual steps pause it.
  useEffect(() => {
    if (!playing) return
    const timer = window.setInterval(() => setStep((s) => Math.min(total, s + 1)), interval)
    return () => window.clearInterval(timer)
  }, [playing, total])

  const play = () => {
    const from = step >= total ? 0 : step
    const next = Math.min(total, from + 1)
    setStep(next)
    setPlaying(next < total)
  }

  useLayoutEffect(() => {
    const node = box.current
    if (!node) return
    const update = () => setSize({ width: node.clientWidth, height: node.clientHeight })
    update()
    const observer = new ResizeObserver(update)
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  const shown = order.slice(0, step)
  const latest = step === 0 ? null : order[step - 1]
  const mine = latest !== null && placed.has(latest.pieceId)
  const caption = latest === null ? text.t('solutionStart') : step === total ? text.t('solutionDone') : ''

  useLayoutEffect(() => {
    const node = canvas.current
    if (!node || size.width === 0) return
    const ctx = prepareCanvas(node, size.width, size.height, 0)
    if (!ctx) return
    const scene = CubeScene.build({
      size: level.size,
      camera,
      centre: { x: size.width / 2, y: size.height / 2 - size.height * 0.05 },
      scale: Math.min(size.width, size.height) / (level.size * 1.9),
      selectedId: latest?.pieceId ?? null,
      showHandles: false,
      solids: [
        ...level.blocked.map((b) => new Solid({ kind: 'die', id: `die${b.y}`, cells: [b], colorKey: '' })),
        ...shown.map((p) => new Solid({ kind: 'piece', id: p.pieceId, cells: p.cells, colorKey: level.pieceById(p.pieceId).colorKey })),
      ],
    })
    paintCube(ctx, scene, skins, {})
  })

  return (
    <ScreenFrame title={text.t('solution')} backLabel={text.t('backToPuzzle')} onBack={onBack} className="solution-screen">
      <div className="solution-body">
        <div className="solution-head" role="status" aria-label={text.t('solutionAnnouncement', { step, total })}>
          <h2>{text.t('solutionStep', { step, total })}</h2>
          <span className={`caption${mine ? ' mine' : ''}`}>
            {mine ? <><Icon name="checkRounded" size={15} />{text.t('onYourBoard')}</> : caption}
          </span>
        </div>
        <div
          ref={box}
          className="solution-cube"
          role="img"
          aria-label={text.t('solutionCubeSemantics', { placed: shown.length, total })}
          onPointerDown={(e) => {
            drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY }
            e.currentTarget.setPointerCapture(e.pointerId)
          }}
          onPointerMove={(e) => {
            const from = drag.current
            if (!from || from.id !== e.pointerId) return
            camera.orbit((e.clientX - from.x) * 0.011, (e.clientY - from.y) * 0.011)
            drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY }
            setView((v) => v + 1)
          }}
          onPointerUp={() => { drag.current = null }}
          onPointerCancel={() => { drag.current = null }}
        >
          <canvas ref={canvas} style={{ width: size.width, height: size.height }} />
        </div>
        <div className="solution-controls">
          <SecondaryAction label={text.t('previousStep')} icon="chevronLeftRounded" iconOnly onPress={step === 0 ? undefined : () => { setPlaying(false); setStep(step - 1) }} style={{ width: 64 }} />
          <PrimaryAction
            label={playing ? text.t('pause') : text.t('play')}
            ariaLabel={playing ? text.t('pauseSolution') : text.t('playSolution')}
            icon={playing ? 'pauseRounded' : step >= total ? 'replayRounded' : 'playArrowRounded'}
            onPress={playing ? () => setPlaying(false) : play}
            style={{ flex: 1 }}
          />
          <SecondaryAction label={text.t('nextStep')} icon="chevronRightRounded" iconOnly onPress={step >= total ? undefined : () => { setPlaying(false); setStep(step + 1) }} style={{ width: 64 }} />
        </div>
        <QuietAction label={text.t('backToPuzzle')} icon="chevronLeftRounded" onPress={onBack} />
      </div>
    </ScreenFrame>
  )
}
