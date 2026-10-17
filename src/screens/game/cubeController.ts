import type { EffectName } from '../../audio/audioService'
import type { Haptic } from '../../feel/haptics'
import type { CompletionAward } from '../../progress/playerProgress'
import type { CubeViewPart, Tip } from '../../settings/gameSettings'
import { CubeAim, type Turned } from '../../cube/aim'
import { CubeCamera, V3 } from '../../cube/camera'
import { formatOf, type CubeFormat } from '../../cube/generator'
import { dist, rect, rectCenter, rectContains, rectEquals, rectFromCenter, rectHeight, rectLerp, rectShift, rectWidth, sub, type Pt, type Rect } from '../../cube/geometry'
import { CubeHintEngine, type CubeHint, sameHint } from '../../cube/hints'
import { Curves, dartRound } from '../../cube/math'
import { CubePlacement, Shapes, Voxel, type Shape } from '../../cube/model'
import { paintCube, type CubeSkins } from '../../cube/painter'
import { CubeScene, Solid, SolidMotion, type GizmoHandle } from '../../cube/scene'
import type { CubeSession } from '../../cube/session'
import { CubeSolver } from '../../cube/solver'
import { DiceThrow } from '../../cube/throw'
import { CubeTrayLayout, paintTrayPiece, trayCamera } from '../../cube/tray'
import { Anim } from './anim'

/** What the screen needs from the app around it. */
export interface CubeServices {
  play(effect: EffectName): void
  feel(haptic: Haptic): void
  cubeView(part: CubeViewPart): boolean
  hasLearned(tip: Tip): boolean
  markLearned(tip: Tip): void
  reduceMotion(): boolean
  /** Saves the session (the everyday or the daily slot). */
  save(): void
  /** The cube was completed: records it and returns what it earned. */
  onSolved(): CompletionAward | null
}

export type Phase = 'readyToRoll' | 'rolling' | 'playing'
type Press = 'none' | 'orbit' | 'tray' | 'trayScroll' | 'piece' | 'handle' | 'carry'
type Transform = 'turn' | 'tilt' | 'spin'
type HomeStart = 'rise' | 'refused' | 'dropped'

/** A piece in the player's hand. */
class Carry {
  readonly pieceId: string
  /** How the player turned it before picking it up. */
  readonly prepared: Shape
  /** Every orientation, fewest quarter turns from [prepared] first. */
  readonly turns: Turned[]
  shape: Shape
  snapKey: string | null = null
  aimed = false
  pointer: Pt = { x: 0, y: 0 }
  /** The snapped position in the cube, or `null` while off the cube. */
  target: Voxel | null = null
  valid = false
  /** Where the piece floats while off the cube. */
  floating: V3 | null = null

  constructor(pieceId: string, prepared: Shape, turns: Turned[]) {
    this.pieceId = pieceId
    this.prepared = prepared
    this.turns = turns
    this.shape = prepared
  }

  get turnedToFit(): boolean {
    return Shapes.key(this.shape) !== Shapes.key(this.prepared)
  }
}

/** A piece on its way back to the tray. */
interface Homing {
  readonly pieceId: string
  readonly start: HomeStart
  readonly cells: readonly Voxel[]
  readonly offset: V3
  readonly trayShape: Shape
  readonly from: Rect
  readonly takeOut: boolean
  readonly back: boolean
}

const homeLead = (h: Homing) => (h.start === 'rise' ? 0.28 : h.start === 'refused' ? 0.42 : 0)
const homeDuration = (h: Homing) => (h.start === 'rise' ? 600 : h.start === 'refused' ? 700 : 340)

interface Morph {
  readonly id: string
  readonly axis: number
  readonly angle: number
  readonly shift: V3
}

/** Where everything goes on screen, measured on every resize. */
export interface CubeLayout {
  readonly width: number
  readonly height: number
  readonly landscape: boolean
  readonly header: Rect
  readonly viewport: Rect
  readonly toolbar: Rect
  readonly caption: Rect
  /** Where the tray may go (it takes what it needs of it). */
  readonly tray: Rect
  readonly prompt: Rect
  readonly result: Rect
}

export function layoutFor(width: number, height: number): CubeLayout {
  const pad = 20
  const landscape = width > height * 1.05 && width >= 600
  if (!landscape) {
    const header = 56
    const toolbar = 46
    const caption = 26
    const trayHeight = width >= 600 ? Math.min(300, height * 0.24) : Math.min(156, height * 0.21)
    const viewportHeight = height - header - toolbar - caption - trayHeight - 8
    const belowCube = header + viewportHeight
    const resultHeight = Math.max(340, toolbar + caption + trayHeight)
    return {
      width,
      height,
      landscape,
      header: rect(pad, 8, width - pad * 2, header - 8),
      viewport: rect(0, header, width, viewportHeight),
      toolbar: rect(12, belowCube, width - 24, toolbar),
      caption: rect(pad, belowCube + toolbar, width - pad * 2, caption),
      tray: rect(pad, belowCube + toolbar + caption, width - pad * 2, trayHeight),
      prompt: rect(pad, belowCube, width - pad * 2, height - belowCube),
      result: rect(pad, height - 8 - resultHeight, width - pad * 2, resultHeight),
    }
  }
  // Wide screens: the cube on the left, the tools and the tray beside it.
  const header = 56
  const panel = Math.min(460, Math.max(320, width * 0.36))
  const panelLeft = width - panel - pad
  const top = header + 8
  const toolbar = 46
  const caption = 26
  const trayTop = top + toolbar + caption + 8
  const trayHeight = Math.max(160, height - trayTop - pad)
  const resultHeight = Math.min(height - top - pad, 420)
  return {
    width,
    height,
    landscape,
    header: rect(pad, 8, width - pad * 2, header - 8),
    viewport: rect(0, header, panelLeft - 8, height - header),
    toolbar: rect(panelLeft - 8, top, panel + 16, toolbar),
    caption: rect(panelLeft, top + toolbar, panel, caption),
    tray: rect(panelLeft, trayTop, panel, trayHeight),
    prompt: rect(panelLeft, top, panel, height - top - pad),
    result: rect(panelLeft, top + (height - top - pad - resultHeight) / 2, panel, resultHeight),
  }
}

/**
 * The game screen's behaviour (`_CubeScreenState` of the mobile app), apart
 * from React: phases, gestures, animations, hints, undo and drawing. All
 * rules stay in [CubeGame]; this orchestrates. React shows the controls and
 * calls in; [subscribe] tells it when what it shows may have changed.
 */
export class CubeController {
  readonly session: CubeSession
  private services: CubeServices
  readonly daily: boolean
  format: CubeFormat
  phase: Phase
  readonly camera = new CubeCamera()

  // Animations (durations as on the phone).
  private readonly explode = new Anim(320)
  private readonly pulse = new Anim(900)
  private readonly view = new Anim(380)
  private readonly morph = new Anim(260)
  private readonly roll = new Anim(1000)
  private readonly trayReveal = new Anim(320)
  private readonly celebration = new Anim(1600)
  private readonly home = new Anim(600)
  private readonly nope = new Anim(320)
  private readonly pop = new Anim(320)
  private readonly anims = [this.explode, this.pulse, this.view, this.morph, this.roll, this.trayReveal, this.celebration, this.home, this.nope, this.pop]

  private morphFrom: Morph | null = null
  private nopeOf: Morph | null = null
  private homing: Homing | null = null
  private popId: string | null = null
  private throw: DiceThrow | null = null
  private rollClock = 0
  private lastWave = -Infinity
  private celebrationYaw = 0
  private viewFrom: [number, number] = [CubeCamera.restYaw, CubeCamera.restPitch]
  private viewToYaw = CubeCamera.restYaw

  xray = false
  selected: string | null = null
  private carry: Carry | null = null
  flash: string | null = null
  private flashTimer: ReturnType<typeof setTimeout> | null = null
  solved = false
  award: CompletionAward | null = null
  resultReady = false
  viewingCube = false
  sheetOpen = false
  private seenHint: CubeHint | null = null
  private placedCount = 0

  // Gestures.
  private pointer: number | null = null
  private press: Press = 'none'
  private downAt: Pt = { x: 0, y: 0 }
  private last: Pt = { x: 0, y: 0 }
  private pressedId: string | null = null
  private handle: GizmoHandle | null = null
  private handleTravel = 0
  private velocity: Pt = { x: 0, y: 0 }
  private spinning = false
  private lastMove = 0
  private lastTapId: string | null = null
  private lastTapAt = 0
  trayScroll = 0

  // Tray slots as drawn, easing towards the layout.
  private readonly slotShown = new Map<string, Rect>()
  private slotTarget = new Map<string, Rect>()
  private slotLevel: string | null = null
  private slotsEasing = false

  layout: CubeLayout = layoutFor(390, 844)
  private tray: CubeTrayLayout | null = null
  private readonly listeners = new Set<() => void>()
  private frameTime = 0
  private dirty = true

  constructor(session: CubeSession, services: CubeServices, options: { daily?: boolean; format?: CubeFormat } = {}) {
    this.session = session
    this.services = services
    this.daily = options.daily ?? false
    const game = session.game
    // A cube that is already finished is not continued: throw a new one.
    if (game.hasPuzzle && !session.isResumable) session.discardPuzzle()
    this.format = options.format ?? session.format
    const resuming = session.isResumable
    this.placedCount = game.placements.length
    this.phase = !resuming ? 'readyToRoll' : session.clockStarted ? 'playing' : 'rolling'
    this.trayReveal.value = this.phase === 'playing' ? 1 : 0
    this.seenHint = session.hints.active
    if (session.hints.active) this.pulse.repeat()
  }

  /** The app's side, as of its latest render. */
  setServices(services: CubeServices): void {
    this.services = services
  }

  /** Starts listening to the cube (the screen is shown); returns the way
   * to stop (the screen is gone). May run more than once (React's strict
   * mode mounts twice). */
  attach(): () => void {
    const disposeGame = this.game.addListener(() => this.onGameChanged())
    const disposeHints = this.hints.addListener(() => this.onHintsChanged())
    if (this.phase === 'playing') this.resumeIfIdle()
    // The daily cube arrives chosen but not yet thrown.
    else if (this.phase === 'rolling' && this.throw === null) this.throwDice()
    return () => {
      disposeGame()
      disposeHints()
      if (this.flashTimer) clearTimeout(this.flashTimer)
      this.flashTimer = null
      this.flash = null
      this.session.pauseClock()
      this.services.save()
    }
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  /** Bumped on every change React shows (see [subscribe]). */
  version = 0

  private changed(): void {
    this.dirty = true
    this.version++
    for (const listener of [...this.listeners]) listener()
  }

  /** Something drawn changed outside (a skin, a display option). */
  markDirty(): void {
    this.dirty = true
  }

  // ---- Reading ------------------------------------------------------------

  get game() {
    return this.session.game
  }

  get hints() {
    return this.session.hints
  }

  get playable(): boolean {
    return this.phase === 'playing' && !this.solved
  }

  get size(): number {
    return this.game.hasPuzzle ? this.game.size : this.format.size
  }

  get reduceMotion(): boolean {
    return this.services.reduceMotion()
  }

  get trayOpacity(): number {
    return this.trayReveal.value
  }

  /** Layers are apart, or on their way apart. */
  get layersOn(): boolean {
    return this.explode.isAnimating ? this.explode.isForward : this.explode.value > 0.5
  }

  get carrying(): boolean {
    return this.carry !== null
  }

  get canUndo(): boolean {
    return this.game.canUndo && this.carry === null && this.phase === 'playing'
  }

  get selectedPlaced(): boolean {
    return this.selected !== null && this.carry === null && this.game.isPlaced(this.selected)
  }

  /** The caption under the cube. */
  caption(t: (key: string, params?: Record<string, string | number>) => string): string {
    if (this.phase === 'rolling') return t('diceFill')
    if (this.flash) return this.flash
    const carry = this.carry
    if (carry) {
      return carry.target === null ? t('captionAim') : !carry.valid ? t('captionTaken') : carry.turnedToFit ? t('captionTurnedToFit') : t('captionRelease')
    }
    switch (this.hints.active?.kind) {
      case 'place': return t('hintPlace')
      case 'relocate': return t('hintRelocate')
      case 'remove': return t('hintRemove')
    }
    if (this.selected) return this.game.isPlaced(this.selected) ? t('captionPlacedHelp') : t('captionPicked')
    if (!this.services.hasLearned('rotate')) return t('tipRotate')
    if (!this.services.hasLearned('place')) return t('tipPlace')
    return t('captionFreeCells', { count: this.game.freeCells.length })
  }

  // ---- Layout -------------------------------------------------------------

  setLayout(layout: CubeLayout): void {
    this.layout = layout
    this.relayout()
    this.changed()
  }

  /** Whether the viewport's height, not its width, limits the cube (wide
   * screens, tablets). Phones are limited by the width, as on mobile. */
  private get heightBound(): boolean {
    const v = this.layout.viewport
    return rectHeight(v) / 2.3 < rectWidth(v) / 1.9
  }

  /** The plate under the cube makes it bottom-heavy: lift it a little
   * (more when the height is what limits it, so the plate stays clear of
   * the tools). */
  private get centre(): Pt {
    const v = this.layout.viewport
    const y = this.heightBound ? v.top + rectHeight(v) * 0.4 : (v.top + v.bottom) / 2 - rectHeight(v) * 0.07
    return { x: (v.left + v.right) / 2, y }
  }

  /** As large as the viewport allows; separated layers need more height. */
  private get scale(): number {
    const v = this.layout.viewport
    const fit = this.heightBound ? rectHeight(v) / 2.3 : Math.min(rectWidth(v), rectHeight(v)) / 1.9
    return (fit / this.size) * (1 - 0.28 * this.explode.value)
  }

  /** The tray, with room already kept for a piece flying home. */
  private relayout(): void {
    const game = this.game
    if (!game.hasPuzzle) {
      this.tray = null
      return
    }
    const ids = game.level.pieces.filter((p) => !game.isPlaced(p.id) || p.id === this.homing?.pieceId).map((p) => p.id)
    const tray = this.layout.landscape ? panelTray(this.layout.tray, ids, this.trayScroll) : new CubeTrayLayout(this.layout.tray, ids, this.trayScroll)
    this.tray = tray
    if (this.trayScroll > tray.maxScroll) this.trayScroll = tray.maxScroll
    const shift = this.scrollShift
    const target = new Map<string, Rect>()
    for (const [id, r] of tray.slots) target.set(id, rectShift(r, { x: -shift.x, y: 0 }))
    this.layoutSlots(target)
  }

  private get scrollShift(): Pt {
    const tray = this.tray
    return tray && tray.scrolls ? { x: -Math.min(Math.max(this.trayScroll, 0), tray.maxScroll), y: 0 } : { x: 0, y: 0 }
  }

  /** New pieces appear in place, the others glide to their new slots. */
  private layoutSlots(target: Map<string, Rect>): void {
    const level = this.game.level.key
    if (this.slotLevel !== level || this.reduceMotion) {
      this.slotLevel = level
      this.slotShown.clear()
      for (const [id, r] of target) this.slotShown.set(id, r)
    }
    for (const id of [...this.slotShown.keys()]) if (!target.has(id)) this.slotShown.delete(id)
    for (const [id, r] of target) if (!this.slotShown.has(id)) this.slotShown.set(id, r)
    this.slotTarget = target
    const settled = [...target].every(([id, r]) => rectEquals(this.slotShown.get(id)!, r))
    if (!settled) this.slotsEasing = true
  }

  // ---- Frame loop ---------------------------------------------------------

  /** Advances everything to frame time [now] (ms); returns whether the
   * picture changed. */
  tick(now: number): boolean {
    const dt = this.frameTime === 0 ? 0 : Math.min(0.1, (now - this.frameTime) / 1000)
    this.frameTime = now
    let moved = false
    for (const anim of this.anims) {
      if (!anim.tick(now)) continue
      moved = true
      // What the phone hangs on these controllers' listeners.
      if (anim === this.roll) this.onRollTick()
      else if (anim === this.view) this.viewStep()
      else if (anim === this.celebration) this.onCelebrationTick()
    }
    if (this.spinning) {
      moved = true
      this.onSpin(dt)
    }
    if (this.slotsEasing) {
      moved = true
      this.easeSlots(dt)
    }
    // React hears of discrete changes only (see [changed]); the frame loop
    // repaints the canvases.
    if (moved || this.dirty) {
      this.dirty = false
      return true
    }
    return false
  }

  private easeSlots(dt: number): void {
    const k = 1 - Math.exp(-dt * 16)
    let moving = false
    for (const [id, target] of this.slotTarget) {
      const shown = this.slotShown.get(id) ?? target
      const next = rectLerp(shown, target, k)
      const done = dist(sub(rectCenter(next), rectCenter(target))) < 0.5 && Math.abs(rectWidth(next) - rectWidth(target)) < 0.5
      this.slotShown.set(id, done ? target : next)
      if (!done) moving = true
    }
    if (!moving) this.slotsEasing = false
  }

  // ---- State changes ------------------------------------------------------

  private onGameChanged(): void {
    if (!this.game.hasPuzzle) {
      this.relayout()
      return this.changed()
    }
    const placed = this.game.placements.length
    if (placed > this.placedCount) this.services.markLearned('place')
    this.placedCount = placed
    const solved = this.game.isSolved
    if (solved !== this.solved) {
      this.solved = solved
      this.resultReady = false
      this.viewingCube = false
      if (solved) {
        this.selected = null
        this.carry = null
        this.onSolved()
      } else {
        this.celebration.reset()
      }
    }
    this.relayout()
    this.services.save()
    this.changed()
  }

  private onSolved(): void {
    this.session.stopClock()
    this.award = this.session.rewardsDisabled ? null : this.services.onSolved()
    setTimeout(() => {
      this.services.play('complete')
      this.services.feel('complete')
    }, 140)
    this.lastWave = -Infinity
    if (this.explode.value > 0) void this.explode.reverse()
    this.spinning = false
    this.celebrationYaw = this.camera.yaw
    this.celebration.duration = this.reduceMotion ? 450 : 1600
    void this.celebration.forward(0)
  }

  /** The finished cube turns a quarter round, then the results come up. */
  private onCelebrationTick(): void {
    if (!this.reduceMotion) this.camera.yaw = this.celebrationYaw + Curves.easeInOutCubic(this.celebration.value) * (Math.PI / 2)
    if (this.solved && !this.resultReady && this.celebration.value >= 0.5) {
      this.resultReady = true
      this.changed()
    }
    const wave = this.wave
    if (wave !== null) {
      for (let y = 0; y < this.size; y++) if (this.lastWave < y + 0.5 && y + 0.5 <= wave) this.services.feel('layer')
      this.lastWave = wave
    }
  }

  private onHintsChanged(): void {
    const hint = this.hints.active
    if (hint && !sameHint(hint, this.seenHint)) {
      // A new hint for a tray piece picks that piece.
      if (!this.game.isPlaced(hint.pieceId)) this.selected = hint.pieceId
      this.pulse.repeat()
    } else if (!hint) {
      this.pulse.reset()
    }
    this.seenHint = hint
    this.services.save()
    this.changed()
  }

  // ---- The throw ----------------------------------------------------------

  /** New cube: the session decides it, the dice act it out. */
  rollDice(): void {
    if (this.phase !== 'readyToRoll') return
    this.session.newPuzzle(this.format)
    this.placedCount = 0
    this.throwDice()
  }

  private throwDice(): void {
    this.services.play('dice')
    this.rollClock = 0
    this.resetView(false)
    const dice = new DiceThrow(this.size, this.game.level.blocked, this.session.seed)
    this.throw = dice
    this.roll.duration = this.reduceMotion ? 350 : Math.round(dice.seconds * 1000)
    this.phase = 'rolling'
    this.relayout()
    void this.roll.forward(0).then(() => this.onDiceSettled())
    this.changed()
  }

  private onDiceSettled(): void {
    if (this.phase !== 'rolling') return
    this.session.startClock()
    this.trayReveal.duration = this.reduceMotion ? 180 : 320
    void this.trayReveal.forward(0)
    this.services.save()
    this.phase = 'playing'
    this.changed()
  }

  /** Each frame of the throw: the dice knocking and settling can be felt. */
  private onRollTick(): void {
    const dice = this.throw
    if (!dice || this.phase !== 'rolling' || this.reduceMotion) return
    const now = this.roll.value * dice.seconds
    if (now - this.rollClock < 0.25) {
      if (dice.hits.some((t) => t > this.rollClock && t <= now)) this.services.feel('diceHit')
      for (let i = 0; i < dice.cells.length; i++) {
        const t = dice.settlesAt(i)
        if (t > this.rollClock && t <= now) this.services.feel('dieHome')
      }
    }
    this.rollClock = now
  }

  /** Die [i] (to cell [cell]) as the throw has it now. */
  private die(i: number, cell: Voxel): Solid {
    const dice = this.throw
    const time = this.roll.value * (dice?.seconds ?? 0)
    const frame = !dice || this.phase !== 'rolling' || this.reduceMotion || dice.landed(i, time) ? null : dice.frame(i, time)
    const h = (this.size - 1) / 2
    return new Solid({
      kind: 'die',
      id: `die${cell.y}`,
      cells: [cell],
      colorKey: '',
      offset: frame ? frame.position.sub(new V3(cell.x - h, cell.y - h, cell.z - h)) : V3.zero,
      motion: frame ? new SolidMotion(frame.axis, frame.angle) : null,
    })
  }

  private dieThrown(i: number): boolean {
    const dice = this.throw
    if (this.phase !== 'rolling' || this.reduceMotion || !dice) return true
    return dice.frame(i, this.roll.value * dice.seconds) !== null
  }

  // ---- The scene ----------------------------------------------------------

  private solids(): Solid[] {
    if (!this.game.hasPuzzle) return []
    const level = this.game.level
    const solids: Solid[] = []
    level.blocked.forEach((b, i) => {
      if (this.dieThrown(i)) solids.push(this.die(i, b))
    })
    for (const p of this.game.placements) {
      if (p.pieceId === this.homing?.pieceId) continue
      solids.push(new Solid({ kind: 'piece', id: p.pieceId, cells: p.cells, colorKey: level.pieceById(p.pieceId).colorKey, motion: this.motionFor(p.pieceId) }))
    }
    const home = this.homing
    if (home && this.homeT < homeLead(home)) {
      // Before the flight: rising out of the cube, or shaking "no".
      const u = this.homeT / homeLead(home)
      const colorKey = level.pieceById(home.pieceId).colorKey
      const move = home.start === 'rise'
        ? this.camera.towardsEye.mul(1.2 * Curves.easeOutCubic(u))
        : home.start === 'refused'
          ? this.camera.toWorld(new V3(1, 0, 0)).mul(0.22 * Math.sin(u * 3 * 2 * Math.PI) * (1 - u))
          : V3.zero
      const held = new Solid({ kind: 'held', id: home.pieceId, cells: home.cells, colorKey, offset: home.offset.add(move) })
      held.refused = home.start === 'refused' ? Math.min(1, u * 6) * (1 - u) : 0
      solids.push(held)
      if (home.start === 'refused') solids.push(new Solid({ kind: 'ghost', id: 'ghost', cells: home.cells, colorKey, invalid: true }))
    }
    const carry = this.carry
    if (carry) {
      const colorKey = level.pieceById(carry.pieceId).colorKey
      const target = carry.target
      if (target) {
        const cells = carry.shape.map((c) => c.add(target))
        const [axis, sign] = this.camera.facingAxis
        solids.push(
          new Solid({ kind: 'ghost', id: 'ghost', cells, colorKey, invalid: !carry.valid }),
          new Solid({ kind: 'held', id: carry.pieceId, cells, colorKey, offset: V3.axis(axis, 0.45 * sign), castsShadow: true }),
        )
      } else if (carry.floating) {
        const h = (this.size - 1) / 2
        const e = Shapes.extent(carry.shape)
        const mid = new V3((e.x - 1) / 2 - h, (e.y - 1) / 2 - h, (e.z - 1) / 2 - h)
        solids.push(new Solid({ kind: 'held', id: carry.pieceId, cells: carry.shape, colorKey, offset: carry.floating.sub(mid) }))
      }
    }
    const hint = this.hints.active
    if (hint && carry?.pieceId !== hint.pieceId) {
      solids.push(new Solid({ kind: 'hint', id: 'hint', cells: hint.shape.map((c) => c.add(hint.origin)), colorKey: level.pieceById(hint.pieceId).colorKey, invalid: hint.kind === 'remove' }))
    }
    return solids
  }

  scene(): CubeScene {
    return CubeScene.build({
      size: this.size,
      solids: this.solids(),
      camera: this.camera,
      centre: this.centre,
      scale: this.scale * this.breath,
      explode: this.explode.value,
      xray: this.xray,
      selectedId: this.carry === null && this.playable ? this.selected : null,
      showHandles: !this.morph.isAnimating,
      freeCells: this.services.cubeView('freeCells') && this.phase === 'playing' ? this.game.freeCells : [],
      grid: this.services.cubeView('grid'),
      // The plate already shows the floor's cells.
      floorGrid: !this.services.cubeView('plate'),
      wave: this.wave,
    })
  }

  /** The light wave rising through the finished cube, in cells. */
  private get wave(): number | null {
    if (!this.solved || this.reduceMotion || !this.celebration.isAnimating) return null
    const t = this.celebration.value / 0.7
    if (t >= 1) return null
    return -1.5 + Curves.easeInOutSine(t) * (this.size + 3)
  }

  /** The finished cube swells a little as the light passes. */
  private get breath(): number {
    if (!this.solved || this.reduceMotion || !this.celebration.isAnimating) return 1
    const t = Math.min(Math.max(this.celebration.value / 0.55, 0), 1)
    return 1 + 0.035 * Math.sin(Math.PI * t)
  }

  /** Where [id] is in the middle of the change [morph] plays, if it is. */
  private motionFor(id: string): SolidMotion | null {
    const nope = this.nopeOf
    if (nope && nope.id === id && this.nope.isAnimating) {
      // Out quickly, then back with a little give.
      const t = this.nope.value
      const b = (Math.sin(Math.PI * t) * Math.exp(-2 * t)) / 0.445
      return new SolidMotion(nope.axis, nope.angle * b, nope.shift.mul(b))
    }
    const from = this.morphFrom
    if (!from || from.id !== id || !this.morph.isAnimating) return null
    const t = Curves.easeOutCubic(this.morph.value)
    return new SolidMotion(from.axis, -from.angle * (1 - t), from.shift.mul(1 - t))
  }

  /** Starts playing a change of [id]; [before] is where its cells were if it
   * is in the cube. */
  private playChange(id: string, before: readonly Voxel[] | null, axis = 0, angle = 0): void {
    if (this.reduceMotion) return
    const after = this.game.placementOf(id)?.cells ?? null
    let shift = V3.zero
    if (before && after) {
      const mid = (cells: readonly Voxel[]) => cells.map((c) => new V3(c.x, c.y, c.z)).reduce((a, b) => a.add(b)).mul(1 / cells.length)
      shift = mid(before).sub(mid(after))
    }
    this.morphFrom = { id, axis, angle, shift }
    void this.morph.forward(0)
  }

  /** A turn or step that has no room: it starts, hits something and
   * springs back, and the player feels a "no". */
  private refuse(id: string, axis = 0, angle = 0, shift: V3 = V3.zero): void {
    this.services.play('reject')
    this.services.feel('reject')
    if (this.reduceMotion) return
    this.nopeOf = { id, axis, angle, shift }
    void this.nope.forward(0)
  }

  // ---- Pointer handling ---------------------------------------------------

  pointerDown(id: number, p: Pt): void {
    if (this.pointer !== null || this.sheetOpen) return
    this.pointer = id
    this.downAt = p
    this.last = p
    this.velocity = { x: 0, y: 0 }
    this.spinning = false
    this.press = 'none'
    const tray = this.tray
    if (this.playable && tray && rectContains(tray.area, p)) {
      this.press = 'tray'
      const slot = tray.slotAt(p)
      // A piece still flying home can't be picked yet.
      this.pressedId = slot === this.homing?.pieceId ? null : slot
      return
    }
    if (this.phase === 'rolling') {
      // A tap skips the throw.
      this.pointer = null
      this.rollClock = Infinity
      this.roll.set(1)
      this.changed()
      return
    }
    if (!rectContains(this.layout.viewport, p)) {
      this.pointer = null
      return
    }
    if (this.playable) {
      const scene = this.scene()
      const handle = this.selected === null ? null : scene.handleAt(p)
      if (handle) {
        this.press = 'handle'
        this.handle = handle
        this.handleTravel = 0
        return
      }
      const piece = scene.pieceAt(p)
      if (piece) {
        this.press = 'piece'
        this.pressedId = piece
        return
      }
    }
    this.press = 'orbit'
  }

  pointerMove(id: number, p: Pt, time: number): void {
    if (id !== this.pointer) return
    const delta = sub(p, this.last)
    const travel = sub(p, this.downAt)
    const moved = dist(travel) > 8
    switch (this.press) {
      case 'orbit':
        this.orbitBy(delta, time)
        break
      case 'tray':
        if (!moved) break
        if ((this.tray?.scrolls ?? false) && (Math.abs(travel.x) >= Math.abs(travel.y) || this.pressedId === null)) {
          // A sideways drag scrolls the tray; up or across picks a piece.
          this.press = 'trayScroll'
          this.scrollTray(delta.x)
        } else if (this.pressedId !== null) {
          this.beginCarry(this.pressedId, this.carriedShape(this.pressedId), p)
        }
        break
      case 'trayScroll':
        this.scrollTray(delta.x)
        break
      case 'piece':
        if (!moved) break
        // A placed piece never comes off by accident: dragging over it
        // turns the cube (a double tap sends it back to the tray).
        this.press = 'orbit'
        this.orbitBy(travel, time)
        break
      case 'handle':
        this.dragHandle(delta)
        break
      case 'carry':
        this.carry!.pointer = p
        this.aim()
        this.changed()
        break
    }
    this.last = p
  }

  pointerUp(id: number, p: Pt, time: number): void {
    if (id !== this.pointer) return
    this.pointer = null
    const tapped = dist(sub(p, this.downAt)) <= 8
    switch (this.press) {
      case 'orbit':
        if (tapped) {
          this.selected = null
          this.changed()
        } else if (dist(this.velocity) > 120) {
          this.spinning = true
        }
        break
      case 'tray':
        if (!tapped || this.pressedId === null) break
        // The first tap picks the piece, the next ones turn it.
        if (this.selected === this.pressedId) {
          this.transform('turn')
        } else {
          this.services.markLearned('rotate')
          this.selected = this.pressedId
          this.changed()
        }
        break
      case 'handle':
        if (tapped && this.handle) this.nudge(this.handle.axis, this.handle.sign)
        break
      case 'piece':
        if (tapped && this.pressedId) {
          const piece = this.pressedId
          const double = piece === this.lastTapId && time - this.lastTapAt < 350
          this.lastTapId = double ? null : piece
          this.lastTapAt = time
          if (double) this.flyHome(piece)
          else {
            this.selected = this.selected === piece ? null : piece
            this.changed()
          }
        }
        break
      case 'carry':
        this.drop()
        break
    }
    this.press = 'none'
  }

  private orbitBy(delta: Pt, time: number): void {
    this.camera.orbit(delta.x * 0.011, delta.y * 0.011)
    const dt = (time - this.lastMove) / 1000
    if (dt > 0) {
      const v = { x: delta.x / dt, y: delta.y / dt }
      this.velocity = { x: this.velocity.x + (v.x - this.velocity.x) * 0.4, y: this.velocity.y + (v.y - this.velocity.y) * 0.4 }
    }
    this.lastMove = time
    this.changed()
  }

  /** The mouse wheel or a trackpad turns the cube too (desktop). */
  wheel(dx: number, dy: number): void {
    if (this.phase === 'readyToRoll') return
    this.camera.orbit(-dx * 0.004, -dy * 0.004)
    this.changed()
  }

  private scrollTray(dx: number): void {
    const tray = this.tray
    if (!tray) return
    this.trayScroll = Math.min(Math.max(this.trayScroll - dx, 0), tray.maxScroll)
    this.relayout()
    this.changed()
  }

  private onSpin(dt: number): void {
    const decay = Math.exp(-dt * 5)
    this.velocity = { x: this.velocity.x * decay, y: this.velocity.y * decay }
    if (dist(this.velocity) < 20) {
      this.spinning = false
      return
    }
    this.camera.orbit(this.velocity.x * dt * 0.011, this.velocity.y * dt * 0.011)
  }

  // ---- Carrying -----------------------------------------------------------

  /** How a tray piece comes into the cube: as it looks in the tray from
   * where the player now stands, or exactly as a hint for it asks. */
  private carriedShape(id: string): Shape {
    const hint = this.hints.active
    if (hint && hint.pieceId === id && hint.kind === 'place') return hint.shape
    return Shapes.reframe(this.game.trayShape(id), trayCamera.frame, this.camera.frame)
  }

  private beginCarry(id: string, shape: Shape, p: Pt): void {
    this.press = 'carry'
    this.selected = null
    this.morph.stop()
    const carry = new Carry(id, shape, CubeAim.byTurns(this.game.pieceById(id), shape))
    carry.pointer = p
    this.carry = carry
    if (this.explode.value > 0) void this.explode.reverse()
    this.services.play('pickup')
    this.services.feel('pickup')
    this.aim()
    this.changed()
  }

  /** Snaps the carried piece to the face the player is looking at. */
  private aim(): void {
    const carry = this.carry!
    const shapeBefore = Shapes.key(carry.shape)
    this.snap(carry)
    // Felt each time the outline moves to another spot, and more firmly
    // when the piece turns itself to fit.
    const target = carry.target
    const shape = Shapes.key(carry.shape)
    const key = target === null ? null : `${target.x},${target.y},${target.z} ${shape}`
    if (key !== carry.snapKey) {
      if (key !== null && carry.aimed) this.services.feel(shape !== shapeBefore && carry.turnedToFit ? 'fitTurn' : 'snap')
      carry.snapKey = key
    }
    carry.aimed = true
  }

  private snap(carry: Carry): void {
    const n = this.size
    const h = (n - 1) / 2
    const [axis, sign] = this.camera.facingAxis
    const hit = this.camera.hitPlane(carry.pointer, this.centre, this.scale, axis, 0)
    if (!hit) return
    const finger = new Map<number, number>()
    for (let a = 0; a < 3; a++) if (a !== axis) finger.set(a, hit.get(a) + h)
    if ([...finger.values()].some((g) => g < -0.9 || g > n - 1 + 0.9)) {
      carry.shape = carry.prepared
      carry.target = null
      carry.floating = hit
      return
    }
    const aim = new CubeAim({ size: n, taken: new Set(this.game.occupancy().keys()), axis, sign, finger })
    // Over its outline, a hinted piece goes to the outline's depth.
    const hint = this.hints.active
    const prepared = carry.prepared
    if (
      hint &&
      hint.pieceId === carry.pieceId &&
      hint.kind !== 'remove' &&
      Shapes.key(hint.shape) === Shapes.key(prepared) &&
      aim.at(aim.centred(prepared), hint.origin.get(axis)).equals(hint.origin) &&
      aim.fits(prepared, hint.origin)
    ) {
      carry.shape = prepared
      carry.target = hint.origin
      carry.valid = true
      return
    }
    const placed = aim.place(carry.turns)
    carry.shape = placed?.shape ?? prepared
    carry.target = placed?.origin ?? aim.front(prepared)
    carry.valid = placed !== null
  }

  private drop(): void {
    const carry = this.carry!
    this.carry = null
    const target = carry.target
    if (target && carry.valid) {
      this.game.place(carry.pieceId, carry.shape, target)
      if (!this.game.isSolved) this.selected = carry.pieceId
      this.services.play('place')
      this.services.feel('place')
      // It settles from where it was held, a little above the cube.
      if (!this.reduceMotion) {
        const [axis, sign] = this.camera.facingAxis
        this.morphFrom = { id: carry.pieceId, axis: 0, angle: 0, shift: V3.axis(axis, 0.45 * sign) }
        void this.morph.forward(0)
      }
    } else if (target === null) {
      // Let go off the cube: straight back to its slot.
      this.services.play('pickup')
      const floating = carry.floating
      if (floating) {
        const e = Shapes.extent(carry.shape)
        const h = (this.size - 1) / 2
        const mid = new V3((e.x - 1) / 2 - h, (e.y - 1) / 2 - h, (e.z - 1) / 2 - h)
        this.goHome(carry.pieceId, 'dropped', carry.shape, floating.sub(mid), carry.shape)
      }
    } else {
      // No room there: it shakes "no" at the red outline, then goes back.
      this.services.play('reject')
      this.services.feel('reject')
      const [axis, sign] = this.camera.facingAxis
      this.goHome(carry.pieceId, 'refused', carry.shape.map((c) => c.add(target)), V3.axis(axis, 0.45 * sign), carry.shape)
    }
    this.changed()
  }

  // ---- The selected piece -------------------------------------------------

  private dragHandle(delta: Pt): void {
    const handle = this.handle!
    const dir = sub(handle.to, handle.from)
    const length = dist(dir) || 1
    this.handleTravel += (delta.x * dir.x + delta.y * dir.y) / length
    const threshold = Math.max(handle.cellPixels * 0.55, 14)
    if (Math.abs(this.handleTravel) < threshold) return
    const sign = this.handleTravel > 0 ? handle.sign : -handle.sign
    this.handleTravel = 0
    this.nudge(handle.axis, sign)
  }

  /** Moves the selected piece one cell along [axis]. */
  nudge(axis: number, sign: number): void {
    const id = this.selected
    if (!id) return
    const before = this.game.placementOf(id)?.cells ?? null
    if (this.game.nudge(id, axis, sign)) {
      this.services.play('turn')
      this.services.feel('turn')
      this.playChange(id, before)
    } else {
      this.refuse(id, 0, 0, V3.axis(axis, 0.2 * sign))
      this.say('captionNoRoomMove')
    }
  }

  /** Reorients the selected piece, in the cube or in the tray, as the
   * player sees it. */
  transform(transform: Transform): void {
    const id = this.selected
    if (!id) return
    const before = this.game.placementOf(id)?.cells ?? null
    const view = before === null ? trayCamera : this.camera
    let done: boolean
    let axis: number
    let angle: number
    if (transform === 'turn') {
      // In the upright plane facing the player, clockwise.
      const [a, sign] = view.facingLevel
      axis = a
      angle = sign > 0 ? -Math.PI / 2 : Math.PI / 2
      done = this.game.turn(id, axis, sign > 0 ? 3 : 1)
    } else if (transform === 'tilt') {
      // About the level axis across the view: the top comes towards the player.
      const [a, sign] = view.rightLevel
      axis = a
      angle = sign > 0 ? Math.PI / 2 : -Math.PI / 2
      done = this.game.turn(id, axis, sign > 0 ? 1 : 3)
    } else {
      // Always about the vertical: the side facing the player swings right.
      const [f, fs] = view.facingLevel
      const [r, rs] = view.rightLevel
      const turns = turnsCarrying(1, Voxel.unit(f, fs), Voxel.unit(r, rs))
      axis = 1
      angle = turns === 1 ? Math.PI / 2 : -Math.PI / 2
      done = this.game.turn(id, axis, turns)
    }
    if (done) {
      this.services.play('turn')
      this.services.feel('turn')
      this.playChange(id, before, axis, angle)
    } else {
      // A bit of the turn, the way it would have gone.
      this.refuse(id, axis, Math.sign(angle) * 0.3)
      this.say('captionNoRoomTurn')
    }
    this.changed()
  }

  private sayText: ((key: string) => string) | null = null

  /** Gives the controller the current language for its short messages. */
  setText(t: (key: string) => string): void {
    this.sayText = t
  }

  private say(key: string): void {
    if (this.flashTimer) clearTimeout(this.flashTimer)
    this.flashTimer = setTimeout(() => {
      this.flash = null
      this.changed()
    }, 2000)
    this.flash = this.sayText ? this.sayText(key) : key
    this.changed()
  }

  done(): void {
    this.selected = null
    this.changed()
  }

  toTray(): void {
    if (this.selected) this.flyHome(this.selected)
  }

  /** Sends a placed piece back to the tray: it rises out of the cube, then
   * flies in an arc to its slot, and lands with a little spring. */
  private flyHome(id: string): void {
    const placement = this.game.placementOf(id)
    if (!placement) return
    this.services.play('pickup')
    this.services.feel('pickup')
    this.selected = null
    this.goHome(id, 'rise', placement.cells, V3.zero, placement.shape, true)
  }

  /** How far along its way the piece going home is, cube (0) to tray (1). */
  private get homeT(): number {
    return this.homing?.back ? 1 - this.home.value : this.home.value
  }

  private goHome(id: string, start: HomeStart, cells: readonly Voxel[], offset: V3, shape: Shape, takeOut = false, back = false): void {
    // One at a time: one still on its way lands at once.
    if (this.homing) {
      this.home.stop()
      this.landHome()
    }
    const trayShape = Shapes.reframe(shape, this.camera.frame, trayCamera.frame)
    // Where the flight starts, drawn the size a tray painter needs.
    const h = (this.size - 1) / 2
    const mid = cells
      .map((c) => new V3(c.x - h, c.y - h, c.z - h))
      .reduce((a, b) => a.add(b))
      .mul(1 / cells.length)
      .add(offset)
      .add(start === 'rise' ? this.camera.towardsEye.mul(1.2) : V3.zero)
    const at = this.camera.project(mid, this.centre, this.scale)
    const e = Shapes.extent(trayShape)
    const span = Math.sqrt(e.x * e.x + e.y * e.y + e.z * e.z)
    const side = at.scale * this.scale * (Math.max(span, 3.2) + 0.8)
    const homing: Homing = { pieceId: id, start, cells, offset, trayShape, from: rectFromCenter(at.offset, side, side), takeOut, back }
    this.homing = homing
    this.relayout()
    if (this.reduceMotion) return this.landHome()
    this.home.duration = homeDuration(homing)
    void this.home.forward(0).then(() => this.landHome())
    this.changed()
  }

  private landHome(): void {
    const homing = this.homing
    if (!homing) return
    this.homing = null
    if (homing.takeOut) {
      this.game.remove(homing.pieceId)
      this.game.reorient(homing.pieceId, homing.trayShape)
    }
    if (homing.back) {
      // Back in its place in the cube.
      this.services.play('place')
      this.services.feel('place')
      if (this.game.isPlaced(homing.pieceId)) this.selected = homing.pieceId
    } else if (!this.reduceMotion) {
      this.services.feel('land')
      this.popId = homing.pieceId
      void this.pop.forward(0)
    }
    this.relayout()
    this.changed()
  }

  /** Takes back the newest change to the cube, playing it backwards. */
  undo(): void {
    if (this.carry) return
    if (this.homing) {
      this.home.stop()
      this.landHome()
    }
    const move = this.game.undo()
    if (!move) return
    const id = move.pieceId
    const { before, after } = move
    this.services.feel('turn')
    if (after && !before) {
      this.services.play('pickup')
      this.selected = null
      this.goHome(id, 'rise', after.cells, V3.zero, after.shape)
    } else if (before && !after) {
      this.services.play('pickup')
      this.selected = null
      this.goHome(id, 'rise', before.cells, V3.zero, before.shape, false, true)
    } else if (before && after) {
      this.services.play('turn')
      const [axis, angle] = turnBetween(after.shape, before.shape)
      this.selected = id
      this.playChange(id, after.cells, axis, angle)
    }
    this.changed()
  }

  // ---- View tools ---------------------------------------------------------

  toggleXray(): void {
    this.xray = !this.xray
    this.changed()
  }

  toggleLayers(): void {
    if (this.explode.value > 0.5 || this.explode.isForward) void this.explode.reverse()
    else void this.explode.forward()
    this.changed()
  }

  resetView(animate = true): void {
    this.spinning = false
    // The shortest way back to the resting angle.
    this.viewToYaw = CubeCamera.restYaw + dartRound((this.camera.yaw - CubeCamera.restYaw) / (2 * Math.PI)) * 2 * Math.PI
    if (!animate) {
      this.camera.yaw = this.viewToYaw
      this.camera.pitch = CubeCamera.restPitch
      this.changed()
      return
    }
    this.viewFrom = [this.camera.yaw, this.camera.pitch]
    void this.view.forward(0)
  }

  private viewStep(): void {
    const t = Curves.easeOutCubic(this.view.value)
    const [yaw, pitch] = this.viewFrom
    this.camera.yaw = yaw + (this.viewToYaw - yaw) * t
    this.camera.pitch = pitch + (CubeCamera.restPitch - pitch) * t
  }

  // ---- Hints, menu, lifecycle ---------------------------------------------

  /** Shows one next step; returns what happened for the screen to act on. */
  requestHint(): 'shown' | 'alreadyShown' | 'noFreeHints' | 'unavailable' | null {
    if (!this.playable) return null
    const result = this.hints.request()
    if (result === 'alreadyShown') void this.pulse.forward(0)
    if (result === 'unavailable') this.say('captionCannotFinish')
    return result
  }

  /** A full solution that keeps the player's pieces where it can. */
  solutionFor(): CubePlacement[] {
    const level = this.game.level
    const keeps = new CubeSolver({
      size: level.size,
      blocked: level.blocked,
      pieces: level.pieces,
      fixed: this.game.placements,
      maxSteps: level.size <= 3 ? null : CubeHintEngine.solverSteps,
    }).solve()
    return keeps ?? level.solution
  }

  openSheet(): void {
    this.carry = null
    this.sheetOpen = true
    this.session.pauseClock()
    this.changed()
  }

  closeSheet(): void {
    this.sheetOpen = false
    this.resumeIfIdle()
    this.changed()
  }

  suspend(): void {
    this.session.pauseClock()
    this.services.save()
  }

  resumeIfIdle(): void {
    if (this.sheetOpen || !this.playable) return
    this.session.resumeClock()
  }

  /** Same cube, pieces back in the tray. The dice are not thrown again. */
  restartPuzzle(): void {
    this.celebration.reset()
    this.session.restartPuzzle()
    this.selected = null
    this.carry = null
    this.award = null
    this.resultReady = false
    this.viewingCube = false
    this.changed()
  }

  /** A genuinely new cube: back to the empty cube and the dice. */
  newPuzzle(): void {
    this.celebration.reset()
    this.session.discardPuzzle()
    this.services.save()
    this.trayReveal.value = 0
    this.phase = 'readyToRoll'
    this.solved = false
    this.award = null
    this.selected = null
    this.carry = null
    this.resultReady = false
    this.viewingCube = false
    this.trayScroll = 0
    this.relayout()
    this.changed()
  }

  autoSolve(): void {
    this.session.disableRewardsForCurrentPuzzle()
    this.game.applySolution(this.solutionFor())
  }

  setViewingCube(on: boolean): void {
    this.viewingCube = on
    this.changed()
  }

  /** The spring of a piece landing back in the tray. */
  private popScale(id: string): number {
    if (id !== this.popId || !this.pop.isAnimating) return 1
    return 1 + 0.16 * (1 - Curves.easeOutBack(this.pop.value))
  }

  // ---- Drawing ------------------------------------------------------------

  /** Draws the tray into [ctx] (its own canvas, the tray area at 0,0). */
  paintTray(ctx: CanvasRenderingContext2D, skins: CubeSkins): void {
    const tray = this.tray
    if (!tray || !this.playable) return
    const area = tray.area
    const shift = this.scrollShift
    for (const [id] of tray.slots) {
      const shown = this.slotShown.get(id)
      if (!shown || id === this.carry?.pieceId || id === this.homing?.pieceId) continue
      const r = rectShift(rectShift(shown, shift), { x: -area.left, y: -area.top })
      const s = this.popScale(id)
      const w = rectWidth(r)
      const h = rectHeight(r)
      ctx.save()
      ctx.translate(r.left + w / 2, r.top + h / 2)
      ctx.scale(s, s)
      ctx.translate(-w / 2, -h / 2)
      paintTrayPiece(ctx, w, h, { shape: this.game.trayShape(id), colorKey: this.game.pieceById(id).colorKey, selected: this.selected === id, motion: this.motionFor(id) }, skins)
      ctx.restore()
    }
  }

  /** Whether the tray has more pieces off its left or right edge. */
  get trayEdges(): { left: boolean; right: boolean } {
    const tray = this.tray
    return { left: this.trayScroll > 1, right: !!tray && this.trayScroll < tray.maxScroll - 1 }
  }

  /** Draws the cube and, on top, a piece flying home. */
  paintCube(ctx: CanvasRenderingContext2D, skins: CubeSkins): void {
    paintCube(ctx, this.scene(), skins, {
      pulse: this.pulse.value,
      showPlate: this.services.cubeView('plate'),
      showBounds: this.services.cubeView('edges'),
    })
    const home = this.homing
    const slot = home ? this.slotShown.get(home.pieceId) : undefined
    if (home && this.tray && this.homeT >= homeLead(home) && slot) {
      const progress = (this.homeT - homeLead(home)) / (1 - homeLead(home))
      const to = rectShift(slot, this.scrollShift)
      const t = Curves.easeInOutCubic(Math.min(Math.max(progress, 0), 1))
      const r = rectLerp(home.from, to, t)
      // A gentle arc: up first, then down into the slot.
      const lift = Math.sin(Math.PI * t) * Math.min(70, dist(sub(rectCenter(to), rectCenter(home.from))) * 0.25)
      const at = rectShift(r, { x: 0, y: -lift })
      ctx.save()
      ctx.translate(at.left, at.top)
      paintTrayPiece(ctx, rectWidth(at), rectHeight(at), { shape: home.trayShape, colorKey: this.game.pieceById(home.pieceId).colorKey }, skins)
      ctx.restore()
    }
  }

  /** Where the tray is drawn (its own canvas), if there is one. */
  get trayArea(): Rect | null {
    return this.tray?.area ?? null
  }
}

/** The tray beside the cube on wide screens: three columns, as many rows
 * as the pieces need (room allowing), from the top of [area]. */
function panelTray(area: Rect, ids: readonly string[], scroll: number): CubeTrayLayout {
  const columns = 3
  const slot = rectWidth(area) / columns
  const maxRows = Math.max(2, Math.floor(rectHeight(area) / (slot * 0.75)))
  const rows = Math.min(Math.max(Math.ceil(ids.length / columns), 2), maxRows)
  const height = Math.min(rectHeight(area), rows * slot * 0.9)
  return new CubeTrayLayout(rect(area.left, area.top, rectWidth(area), height), ids, scroll, rows, columns)
}

/** How many quarter turns about [axis] carry direction [from] onto [to]. */
function turnsCarrying(axis: number, from: Voxel, to: Voxel): number {
  let v = from
  for (let turns = 1; turns < 4; turns++) {
    v = axis === 0 ? new Voxel(v.x, -v.z, v.y) : axis === 1 ? new Voxel(v.z, v.y, -v.x) : new Voxel(-v.y, v.x, v.z)
    if (v.equals(to)) return turns
  }
  return 1
}

/** The single turn (axis and angle) that takes [from] to [to]. */
function turnBetween(from: Shape, to: Shape): [number, number] {
  const key = Shapes.key(to)
  if (Shapes.key(from) === key) return [0, 0]
  for (let axis = 0; axis < 3; axis++) {
    for (const [turns, angle] of [[1, Math.PI / 2], [3, -Math.PI / 2], [2, Math.PI]] as const) {
      if (Shapes.key(Shapes.rotate(from, axis, turns)) === key) return [axis, angle]
    }
  }
  return [0, 0]
}

export { formatOf }
