import type { CubeGame } from './game'
import { CubePiece, CubePlacement, Shapes, Voxel, type Shape } from './model'
import { CubeSolver } from './solver'

/** What a hint asks the player to do. */
export type CubeHintKind = 'place' | 'relocate' | 'remove'

/** One next step: [pieceId] with [shape] at [origin] (for `remove` the place
 * it is in now). */
export interface CubeHint {
  readonly kind: CubeHintKind
  readonly pieceId: string
  readonly shape: Shape
  readonly origin: Voxel
}

export function hintCells(hint: CubeHint): Voxel[] {
  return hint.shape.map((c) => c.add(hint.origin))
}

export function hintToJson(hint: CubeHint): unknown {
  return { kind: hint.kind, piece: hint.pieceId, shape: hint.shape.map((c) => [c.x, c.y, c.z]), at: [hint.origin.x, hint.origin.y, hint.origin.z] }
}

export function hintFromJson(json: unknown): CubeHint | null {
  try {
    if (!json || typeof json !== 'object') return null
    const j = json as { kind: string; piece: string; shape: number[][]; at: number[] }
    if (j.kind !== 'place' && j.kind !== 'relocate' && j.kind !== 'remove') return null
    return { kind: j.kind, pieceId: j.piece, shape: j.shape.map((c) => new Voxel(c[0], c[1], c[2])), origin: new Voxel(j.at[0], j.at[1], j.at[2]) }
  } catch {
    return null
  }
}

export function sameHint(a: CubeHint | null, b: CubeHint | null): boolean {
  if (!a || !b) return a === b
  return a.kind === b.kind && a.pieceId === b.pieceId && a.origin.equals(b.origin) && Shapes.key(a.shape) === Shapes.key(b.shape)
}

const sameCells = (a: Voxel[], b: Voxel[]) => {
  if (a.length !== b.length) return false
  const keys = new Set(a.map((c) => c.key))
  return b.every((c) => keys.has(c.key))
}

/**
 * Finds the next step (`cube_hints.dart`). While everything placed agrees
 * with the cube's known solution, that solution gives it at once. Otherwise
 * the solver looks for a completion around the player's pieces; failing
 * that, a misplaced piece is moved or taken out.
 */
export const CubeHintEngine = {
  /** Search budget for the bigger cubes: a fraction of a second. */
  solverSteps: 60000,

  next(game: CubeGame): CubeHint | null {
    if (!game.hasPuzzle || game.isSolved) return null
    const level = game.level
    const match = matchSolution(game)
    if (match.misplaced.length === 0) {
      const step = nextSpot(game, match.open)
      if (step) return step
    }
    const completion = new CubeSolver({
      size: level.size,
      blocked: level.blocked,
      pieces: level.pieces,
      fixed: game.placements,
      maxSteps: level.size <= 3 ? null : CubeHintEngine.solverSteps,
    }).solve()
    if (completion) {
      const next = lowest(completion.filter((p) => !game.isPlaced(p.pieceId)))
      if (next) return { kind: 'place', pieceId: next.pieceId, shape: next.shape, origin: next.origin }
    }
    for (const placed of match.misplaced) {
      const piece = level.pieceById(placed.pieceId)
      for (const spot of byLayer(match.open)) {
        if (level.pieceById(spot.pieceId).shapeKey !== piece.shapeKey) continue
        const shape = asPiece(piece, spot.shape)
        if (shape && game.fits(spot.cells, placed.pieceId)) {
          return { kind: 'relocate', pieceId: placed.pieceId, shape, origin: spot.origin }
        }
      }
      return { kind: 'remove', pieceId: placed.pieceId, shape: placed.shape, origin: placed.origin }
    }
    return null
  },

  /** Whether [hint] still makes sense: its piece is not done yet and the
   * outline is still free. */
  stillValid(game: CubeGame, hint: CubeHint): boolean {
    if (!game.hasPuzzle || game.isSolved || !game.level.pieces.some((p) => p.id === hint.pieceId)) return false
    const current = game.placementOf(hint.pieceId)
    const target = hintCells(hint)
    const sits = (p: CubePlacement) => sameCells(p.cells, target)
    if (hint.kind === 'remove') return current !== null && sits(current)
    return (current === null || !sits(current)) && game.fits(target, hint.pieceId)
  },
}

/** Pairs placed pieces with spots of the known solution that hold the same
 * shape at the same cells. Interchangeable pieces may take each other's
 * spots. */
function matchSolution(game: CubeGame): { open: CubePlacement[]; misplaced: CubePlacement[] } {
  const level = game.level
  const open = [...level.solution]
  const misplaced: CubePlacement[] = []
  for (const placed of game.placements) {
    const shape = level.pieceById(placed.pieceId).shapeKey
    const cells = placed.cells
    const spot = open.findIndex((s) => level.pieceById(s.pieceId).shapeKey === shape && sameCells(s.cells, cells))
    if (spot < 0) misplaced.push(placed)
    else open.splice(spot, 1)
  }
  return { open, misplaced }
}

/** The lowest open spot of the known solution, for a tray piece of its shape. */
function nextSpot(game: CubeGame, open: CubePlacement[]): CubeHint | null {
  const level = game.level
  const waiting = game.trayPieces
  for (const spot of byLayer(open)) {
    const shape = level.pieceById(spot.pieceId).shapeKey
    const piece = waiting.find((p) => p.shapeKey === shape)
    const turned = piece ? asPiece(piece, spot.shape) : null
    if (piece && turned) return { kind: 'place', pieceId: piece.id, shape: turned, origin: spot.origin }
  }
  return null
}

/** [shape] as one of [piece]'s own orientations. */
function asPiece(piece: CubePiece, shape: Shape): Shape | null {
  const key = Shapes.key(shape)
  return piece.orientations.find((o) => Shapes.key(o) === key) ?? null
}

/** Bottom layer first, then back to front, left to right: the order a player
 * fills a cube in. */
function byLayer(spots: CubePlacement[]): CubePlacement[] {
  const rank = (p: CubePlacement) => Math.min(...p.cells.map((c) => c.index(64)))
  return [...spots].sort((a, b) => rank(a) - rank(b))
}

function lowest(spots: CubePlacement[]): CubePlacement | null {
  return spots.length === 0 ? null : byLayer(spots)[0]
}

/** What happened when the player asked for a hint. */
export type HintRequest = 'shown' | 'alreadyShown' | 'noFreeHints' | 'unavailable'

/**
 * The hints of the current cube: free ones left and the one on screen. Free
 * hints belong to a puzzle: a new puzzle brings [freePerPuzzle] again,
 * restarting the same one does not.
 */
export class CubeHints {
  static readonly freePerPuzzle = 3

  private free = CubeHints.freePerPuzzle
  private activeHint: CubeHint | null = null
  private readonly listeners = new Set<() => void>()
  private readonly game: CubeGame
  private readonly onHintShown?: () => void

  constructor(game: CubeGame, onHintShown?: () => void) {
    this.game = game
    this.onHintShown = onHintShown
    game.addListener(() => this.revalidate())
  }

  addListener(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private notify(): void {
    for (const l of [...this.listeners]) l()
  }

  get freeRemaining(): number {
    return this.free
  }

  /** The hint on screen, if any. */
  get active(): CubeHint | null {
    return this.activeHint
  }

  private get inPlay(): boolean {
    return this.game.hasPuzzle && !this.game.isSolved
  }

  /** Uses a free hint to show the next step. Asking again while a hint is
   * shown costs nothing. */
  request(): HintRequest {
    if (!this.inPlay) return 'unavailable'
    if (this.activeHint) return 'alreadyShown'
    if (this.free === 0) return 'noFreeHints'
    const hint = CubeHintEngine.next(this.game)
    if (!hint) return 'unavailable'
    this.free--
    this.show(hint)
    return 'shown'
  }

  /** A hint paid for with a watched video: shown at once. */
  grantRewardedHint(): boolean {
    if (!this.inPlay) return false
    const hint = CubeHintEngine.next(this.game)
    if (!hint) return false
    this.show(hint)
    return true
  }

  private show(hint: CubeHint): void {
    this.activeHint = hint
    this.onHintShown?.()
    this.notify()
  }

  /** A new puzzle: all free hints back, nothing shown. */
  resetForNewPuzzle(): void {
    if (this.free === CubeHints.freePerPuzzle && !this.activeHint) return
    this.free = CubeHints.freePerPuzzle
    this.activeHint = null
    this.notify()
  }

  /** The same puzzle again: the hint on screen goes, used hints stay used. */
  clearActive(): void {
    if (!this.activeHint) return
    this.activeHint = null
    this.notify()
  }

  /** Brings back a saved state; a saved hint the cube no longer allows is
   * dropped. */
  restore(freeRemaining: number, active: CubeHint | null): void {
    this.free = Math.min(Math.max(freeRemaining, 0), CubeHints.freePerPuzzle)
    this.activeHint = active && CubeHintEngine.stillValid(this.game, active) ? active : null
    this.notify()
  }

  private revalidate(): void {
    const active = this.activeHint
    if (!active || CubeHintEngine.stillValid(this.game, active)) return
    this.activeHint = null
    this.notify()
  }
}
