import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { CubePicture } from '../components/CubePicture'
import { sampleDice, sampleParts } from '../cube/samples'
import { ScreenFrame } from '../components/ScreenFrame'
import { TrayPiece } from '../components/TrayPiece'
import { PrimaryAction, QuietAction } from '../components/ui'
import { Curves } from '../cube/math'
import { CubePieces, Shapes } from '../cube/model'
import { SolidMotion } from '../cube/scene'
import { useText } from '../i18n/text'

const lessonKeys = ['Board', 'Pieces', 'Rotate', 'Flip', 'Place', 'Fill'] as const

/**
 * Six short lessons drawn with the real cube renderer (mobile
 * `HowToPlayScreen`). Every statement matches the engine: one die per
 * layer, pieces that hold exactly the free cells, quarter turns, pieces
 * entering from the player's side, solved when every free cell is covered.
 * Swipe, the arrow keys or the buttons move between lessons.
 */
export function HowToPlay({ reduceMotion, onDone }: { reduceMotion: boolean; onDone: () => void }) {
  const text = useText()
  const [index, setIndex] = useState(0)
  const [drag, setDrag] = useState(0)
  const [area, setArea] = useState({ width: window.innerWidth, height: window.innerHeight - 140 })
  const pager = useRef<HTMLDivElement>(null)
  const swipe = useRef<{ pointerId: number; x: number; y: number; active: boolean } | null>(null)
  const count = lessonKeys.length
  const last = index === count - 1

  useLayoutEffect(() => {
    const node = pager.current
    if (!node) return
    const update = () => setArea({ width: node.clientWidth, height: node.clientHeight })
    update()
    const observer = new ResizeObserver(update)
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  const go = (next: number) => {
    if (next < 0) return
    if (next >= count) return onDone()
    setIndex(next)
  }

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey) return
      if (event.key === 'ArrowRight') go(index + 1)
      else if (event.key === 'ArrowLeft') go(index - 1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  // Horizontal swipes page like the mobile PageView; a demo that is dragged
  // itself marks its area with data-no-swipe.
  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest('[data-no-swipe]')) return
    swipe.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, active: false }
  }
  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const s = swipe.current
    if (!s || s.pointerId !== event.pointerId) return
    const dx = event.clientX - s.x
    const dy = event.clientY - s.y
    if (!s.active && Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy)) {
      s.active = true
      event.currentTarget.setPointerCapture(event.pointerId)
    }
    if (s.active) setDrag((index === 0 && dx > 0) || (last && dx < 0) ? dx / 3 : dx)
  }
  const onPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    const s = swipe.current
    if (!s || s.pointerId !== event.pointerId) return
    swipe.current = null
    if (!s.active) return
    const dx = event.clientX - s.x
    setDrag(0)
    if (dx < -area.width * 0.18 && !last) setIndex(index + 1)
    else if (dx > area.width * 0.18 && index > 0) setIndex(index - 1)
  }

  // A square illustration, at most 320 (400 on tablets), never wider than
  // the page or taller than half of it.
  const size = Math.max(120, Math.min(area.width >= 600 ? 400 : 320, area.width - 64, area.height * 0.5))
  const illustrations: ReactNode[] = [
    <CubePicture key="board" extent={size} dice={sampleDice} />,
    <PieceSet key="pieces" width={size} />,
    <div key="rotate" data-no-swipe><CubePicture extent={size} dice={sampleDice} parts={sampleParts.slice(0, 4)} turnable /></div>,
    <DemoPiece key="flip" size={size} reduceMotion={reduceMotion} />,
    <CubePicture key="place" extent={size} dice={sampleDice} parts={sampleParts.slice(0, 2)} ghost={sampleParts[2]} />,
    <CubePicture key="fill" extent={size} dice={sampleDice} parts={sampleParts} />,
  ]

  return (
    <ScreenFrame
      title={text.t('howToPlay')}
      backLabel={text.t('back')}
      onBack={onDone}
      trailing={<span className="caption lesson-counter" aria-label={text.t('solutionStep', { step: index + 1, total: count })}>{index + 1}/{count}</span>}
    >
      <div className="howto">
        <div ref={pager} className="howto-pager" onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}>
          <div
            className="howto-track"
            style={{
              transform: `translateX(calc(${-index * 100}% + ${drag}px))`,
              transition: drag || reduceMotion ? 'none' : 'transform 320ms cubic-bezier(0.215, 0.61, 0.355, 1)',
            }}
          >
            {lessonKeys.map((key, i) => (
              <section key={key} className="lesson" aria-hidden={i !== index} inert={i !== index}>
                <div className="lesson-content">
                  <div className="lesson-art" style={{ minWidth: size, height: size }}>{illustrations[i]}</div>
                  <h2 className="lesson-title">{text.t(`how${key}Title`)}</h2>
                  <p className="lesson-body">{text.t(`how${key}Body`)}</p>
                </div>
              </section>
            ))}
          </div>
        </div>
        <div className="howto-controls">
          <QuietAction label={text.t('back')} onPress={index === 0 ? undefined : () => go(index - 1)} style={{ width: 96 }} />
          <div className="lesson-dots" aria-hidden="true">
            {lessonKeys.map((key, i) => <span key={key} className={i === index ? 'active' : ''} />)}
          </div>
          <PrimaryAction label={last ? text.t('done') : text.t('next')} compact onPress={() => go(index + 1)} style={{ width: 96 }} />
        </div>
      </div>
    </ScreenFrame>
  )
}

/** The seven pieces of the 3×3×3 cube, as they appear in the tray. */
function PieceSet({ width }: { width: number }) {
  const slot = width / 4
  return (
    <div className="cube-piece-set" aria-hidden="true" style={{ width }}>
      {CubePieces.standard.map((piece) => <TrayPiece key={piece.id} shape={piece.cells} colorKey={piece.colorKey} size={slot} />)}
    </div>
  )
}

/** One piece that really turns on tap, a quarter turn about the vertical,
 * played out like in the game. */
function DemoPiece({ size, reduceMotion }: { size: number; reduceMotion: boolean }) {
  const text = useText()
  const [shape, setShape] = useState(CubePieces.ell.cells)
  const [turn, setTurn] = useState(1)
  const frame = useRef(0)
  useEffect(() => () => cancelAnimationFrame(frame.current), [])
  const rotate = () => {
    setShape((s) => Shapes.rotate(s, 1))
    if (reduceMotion) return
    cancelAnimationFrame(frame.current)
    let start: number | null = null
    const tick = (now: number) => {
      start ??= now
      const t = Math.min(1, (now - start) / 260)
      setTurn(t)
      if (t < 1) frame.current = requestAnimationFrame(tick)
    }
    setTurn(0)
    frame.current = requestAnimationFrame(tick)
  }
  const t = Curves.easeOutCubic(turn)
  return (
    <button type="button" className="cube-demo-piece" aria-label={text.t('pieceSpin')} onClick={rotate}>
      <TrayPiece shape={shape} colorKey={CubePieces.ell.colorKey} size={size * 0.8} motion={t < 1 ? new SolidMotion(1, (-Math.PI / 2) * (1 - t)) : null} />
    </button>
  )
}
