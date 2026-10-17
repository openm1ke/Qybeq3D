import { CubeGame } from './game'
import { CubePuzzles, allFormats, CubeFormats, type CubeFormat } from './generator'
import { CubeHints, hintFromJson, hintToJson, type CubeHint } from './hints'
import { CubeLevel, CubePlacement, Voxel, type Shape } from './model'
import { mathRandom, type RandomSource } from './stableRandom'

/** Durable snapshot of an unfinished cube (`SavedCube`): which cube it is,
 * how every piece lies, the time played and the state of its hints. The
 * JSON is the same as the phone's, so a save reads the same on both. */
export interface SavedCube {
  readonly size: number
  readonly seed: number
  /** The generator that made the cube. */
  readonly generator: number
  readonly trayShapes: Map<string, Shape>
  readonly placements: CubePlacement[]
  readonly elapsedMs: number
  readonly freeHints: number
  readonly activeHint: CubeHint | null
  readonly solutionUnlocked: boolean
  readonly assistanceUsed: boolean
}

const savedVersion = 1

const shapeJson = (shape: Shape) => shape.map((c) => [c.x, c.y, c.z])
const readShape = (json: unknown) => (json as number[][]).map((c) => new Voxel(c[0], c[1], c[2]))

export function encodeSavedCube(saved: SavedCube): string {
  return JSON.stringify({
    v: savedVersion,
    gen: saved.generator,
    size: saved.size,
    seed: saved.seed,
    tray: Object.fromEntries([...saved.trayShapes].map(([id, shape]) => [id, shapeJson(shape)])),
    placed: saved.placements.map((p) => ({ piece: p.pieceId, shape: shapeJson(p.shape), at: [p.origin.x, p.origin.y, p.origin.z] })),
    elapsedMs: Math.round(saved.elapsedMs),
    hints: {
      free: saved.freeHints,
      active: saved.activeHint ? hintToJson(saved.activeHint) : null,
      solution: saved.solutionUnlocked,
      assisted: saved.assistanceUsed,
    },
  })
}

/** `null` for anything unreadable or of another format version. */
export function decodeSavedCube(raw: string): SavedCube | null {
  try {
    const json = JSON.parse(raw)
    if (json.v !== savedVersion) return null
    const hints = json.hints && typeof json.hints === 'object' ? json.hints : null
    const free = hints && Number.isInteger(hints.free) ? Math.min(Math.max(hints.free, 0), CubeHints.freePerPuzzle) : CubeHints.freePerPuzzle
    if (!Number.isInteger(json.gen) || !Number.isInteger(json.size) || !Number.isInteger(json.seed)) return null
    return {
      generator: json.gen,
      size: json.size,
      seed: json.seed,
      trayShapes: new Map(Object.entries(json.tray as Record<string, unknown>).map(([id, shape]) => [id, readShape(shape)])),
      placements: (json.placed as { piece: string; shape: unknown; at: number[] }[]).map(
        (p) => new CubePlacement(p.piece, readShape(p.shape), new Voxel(p.at[0], p.at[1], p.at[2])),
      ),
      elapsedMs: Number(json.elapsedMs) || 0,
      freeHints: free,
      activeHint: hints ? hintFromJson(hints.active) : null,
      solutionUnlocked: !!hints && hints.solution === true,
      assistanceUsed: !!hints && (hints.assisted === true || hints.solution === true),
    }
  } catch {
    return null
  }
}

/**
 * The one cube the player is working on (`CubeSession`), convertible to and
 * from a [SavedCube]. Also keeps the play clock: it only runs while the cube
 * is on screen and the page is visible.
 */
export class CubeSession {
  readonly game = new CubeGame()
  readonly hints: CubeHints
  private readonly random: RandomSource
  private readonly now: () => number

  private formatValue: CubeFormat = CubeFormats.three
  private seedValue = 0
  private solutionUnlockedValue = false
  private assistanceUsedValue = false
  private rewardsDisabledValue = false

  private banked = 0
  private runningSince: number | null = null
  private clockStartedValue = false
  private solvedInValue: number | null = null

  constructor(options: { random?: RandomSource; now?: () => number } = {}) {
    this.random = options.random ?? mathRandom
    this.now = options.now ?? (() => Date.now())
    this.hints = new CubeHints(this.game, () => this.markAssistanceUsed())
  }

  get format(): CubeFormat {
    return this.formatValue
  }

  get seed(): number {
    return this.seedValue
  }

  /** The solution was paid for with a video and can be viewed again. */
  get solutionUnlocked(): boolean {
    return this.solutionUnlockedValue
  }

  unlockSolution(): void {
    this.solutionUnlockedValue = true
    this.assistanceUsedValue = true
  }

  get assistanceUsed(): boolean {
    return this.assistanceUsedValue
  }

  get rewardsDisabled(): boolean {
    return this.rewardsDisabledValue
  }

  markAssistanceUsed(): void {
    this.assistanceUsedValue = true
  }

  /** Debug completion exercises the visuals without changing progression. */
  disableRewardsForCurrentPuzzle(): void {
    this.rewardsDisabledValue = true
  }

  /** Names the cube in the player's records. */
  get puzzleKey(): string | null {
    return this.game.hasPuzzle ? `roll:${this.game.level.key}` : null
  }

  /** A cube in play that is not finished yet: what "Continue" resumes. */
  get isResumable(): boolean {
    return this.game.hasPuzzle && !this.game.isSolved
  }

  get placedCount(): number {
    return this.game.placements.length
  }

  get pieceCount(): number {
    return this.game.hasPuzzle ? this.game.level.pieces.length : 0
  }

  // ---- Play clock ---------------------------------------------------------

  /** `false` until the dice have settled on a new cube ("--:--"). */
  get clockStarted(): boolean {
    return this.clockStartedValue
  }

  get clockRunning(): boolean {
    return this.runningSince !== null
  }

  get solvedInMs(): number | null {
    return this.solvedInValue
  }

  get elapsedMs(): number {
    if (this.solvedInValue !== null) return this.solvedInValue
    return this.banked + (this.runningSince === null ? 0 : this.now() - this.runningSince)
  }

  /** Starts timing a freshly thrown (or restarted) cube from zero. */
  startClock(): void {
    this.banked = 0
    this.solvedInValue = null
    this.clockStartedValue = true
    this.runningSince = this.now()
  }

  pauseClock(): void {
    if (this.runningSince === null) return
    this.banked += this.now() - this.runningSince
    this.runningSince = null
  }

  resumeClock(): void {
    if (!this.clockStartedValue || this.solvedInValue !== null || this.runningSince !== null) return
    if (!this.isResumable) return
    this.runningSince = this.now()
  }

  stopClock(): void {
    this.pauseClock()
    this.solvedInValue ??= this.banked
  }

  resetClock(): void {
    this.banked = 0
    this.runningSince = null
    this.clockStartedValue = false
    this.solvedInValue = null
  }

  // ---- Puzzle lifecycle ---------------------------------------------------

  /** Throws the dice for a new cube of [format]; a [seed] names a particular
   * cube (the daily one), otherwise a new one is drawn. */
  newPuzzle(format: CubeFormat, seed?: number): CubeLevel {
    this.resetHelp()
    this.formatValue = format
    this.seedValue = seed ?? this.random.nextInt(0x7fffffff)
    const level = CubePuzzles.generate(format, this.seedValue)
    this.game.load(level)
    this.resetClock()
    return level
  }

  /** Same cube, pieces back in the tray, clock from zero. */
  restartPuzzle(): void {
    this.hints.clearActive()
    this.game.reset()
    this.startClock()
  }

  /** Drops the current cube; the next starts with a fresh throw. */
  discardPuzzle(): void {
    this.resetHelp()
    this.game.clear()
    this.resetClock()
  }

  private resetHelp(): void {
    this.hints.resetForNewPuzzle()
    this.solutionUnlockedValue = false
    this.assistanceUsedValue = false
    this.rewardsDisabledValue = false
  }

  // ---- Persistence --------------------------------------------------------

  /** Snapshot for storage, or `null` when there is nothing to resume. */
  toSaved(): SavedCube | null {
    if (!this.isResumable) return null
    const trayShapes = new Map<string, Shape>()
    for (const p of this.game.level.pieces) if (!this.game.isPlaced(p.id)) trayShapes.set(p.id, this.game.trayShape(p.id))
    return {
      size: this.formatValue.size,
      seed: this.seedValue,
      generator: CubePuzzles.version,
      trayShapes,
      placements: this.game.placements,
      elapsedMs: this.elapsedMs,
      freeHints: this.hints.freeRemaining,
      activeHint: this.hints.active,
      solutionUnlocked: this.solutionUnlockedValue,
      assistanceUsed: this.assistanceUsedValue,
    }
  }

  /** Rebuilds the saved cube directly in play (no dice animation). */
  restore(saved: SavedCube): boolean {
    if (saved.generator !== CubePuzzles.version) return false
    const format = allFormats.find((f) => f.size === saved.size)
    if (!format) return false
    this.resetHelp()
    this.formatValue = format
    this.seedValue = saved.seed
    this.game.load(CubePuzzles.generate(format, saved.seed), { trayShapes: saved.trayShapes, placements: saved.placements })
    if (!this.isResumable) {
      this.discardPuzzle()
      return false
    }
    this.hints.restore(saved.freeHints, saved.activeHint)
    this.solutionUnlockedValue = saved.solutionUnlocked
    this.assistanceUsedValue = saved.assistanceUsed || saved.solutionUnlocked
    this.banked = saved.elapsedMs
    this.runningSince = null
    this.clockStartedValue = true
    this.solvedInValue = null
    return true
  }
}
