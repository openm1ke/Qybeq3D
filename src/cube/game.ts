import { CubeLevel, CubePiece, CubePlacement, Shapes, Voxel, type Shape } from './model'

/** One change to the cube that can be taken back: piece [pieceId] went from
 * [before] to [after] (`null`: in the tray). */
export interface CubeMove {
  readonly pieceId: string
  readonly before: CubePlacement | null
  readonly after: CubePlacement | null
  /** How it lay in the tray before the change. */
  readonly trayBefore: Shape
}

type Listener = () => void

/**
 * The rules of one cube being filled (`cube_game.dart`): what is placed, how
 * each piece in the tray is turned, and how pieces may move. Notifies only
 * at stable moments, which are exactly the moments worth saving.
 *
 * Changes to the cube can be undone, newest first; turning pieces in the
 * tray is not a change to the cube and is not kept.
 */
export class CubeGame {
  private levelValue: CubeLevel | null = null
  private readonly placementsById = new Map<string, CubePlacement>()
  private readonly trayShapes = new Map<string, Shape>()
  private readonly history: CubeMove[] = []
  private readonly listeners = new Set<Listener>()

  /** How many changes are kept to undo. */
  static readonly historyLength = 100

  constructor(level?: CubeLevel) {
    if (level) this.load(level)
  }

  addListener(listener: Listener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private notify(): void {
    for (const listener of [...this.listeners]) listener()
  }

  get hasPuzzle(): boolean {
    return this.levelValue !== null
  }

  get level(): CubeLevel {
    if (!this.levelValue) throw new Error('no puzzle')
    return this.levelValue
  }

  get size(): number {
    return this.level.size
  }

  get placements(): CubePlacement[] {
    return [...this.placementsById.values()]
  }

  placementOf(id: string): CubePlacement | null {
    return this.placementsById.get(id) ?? null
  }

  isPlaced(id: string): boolean {
    return this.placementsById.has(id)
  }

  pieceById(id: string): CubePiece {
    return this.level.pieceById(id)
  }

  /** The orientation a piece has while it waits in the tray. */
  trayShape(id: string): Shape {
    return this.trayShapes.get(id)!
  }

  get trayPieces(): CubePiece[] {
    return this.level.pieces.filter((p) => !this.isPlaced(p.id))
  }

  get isSolved(): boolean {
    return this.hasPuzzle && this.placementsById.size === this.level.pieces.length
  }

  /** Whether there is a change to undo (none once the cube is complete). */
  get canUndo(): boolean {
    return this.history.length > 0 && !this.isSolved
  }

  /** Starts [level] with every piece in the tray, or brings back a saved
   * state. Saved shapes and placements that do not fit are dropped. */
  load(level: CubeLevel, saved: { trayShapes?: Map<string, Shape>; placements?: CubePlacement[] } = {}): void {
    this.levelValue = level
    this.placementsById.clear()
    this.history.length = 0
    this.trayShapes.clear()
    for (const [id, shape] of level.startShapes) this.trayShapes.set(id, shape)
    for (const [id, shape] of saved.trayShapes ?? []) {
      if (level.pieces.some((p) => p.id === id && p.hasOrientation(shape))) this.trayShapes.set(id, shape)
    }
    for (const p of saved.placements ?? []) {
      const piece = level.pieces.find((q) => q.id === p.pieceId)
      if (piece && piece.hasOrientation(p.shape) && this.fits(p.cells, p.pieceId)) {
        this.placementsById.set(p.pieceId, p)
        this.trayShapes.set(p.pieceId, p.shape)
      }
    }
    this.notify()
  }

  /** No puzzle at all (before the dice are thrown). */
  clear(): void {
    this.levelValue = null
    this.placementsById.clear()
    this.trayShapes.clear()
    this.history.length = 0
    this.notify()
  }

  /** Every piece back in the tray as it started; same dice. */
  reset(): void {
    if (this.levelValue) this.load(this.levelValue)
  }

  /** Who holds each cell: a piece id, or `#die` for the blocking dice. */
  occupancy(ignoring?: string): Map<string, string> {
    const taken = new Map<string, string>()
    for (const b of this.level.blocked) taken.set(b.key, '#die')
    for (const p of this.placementsById.values()) {
      if (p.pieceId === ignoring) continue
      for (const c of p.cells) taken.set(c.key, p.pieceId)
    }
    return taken
  }

  /** Whether [cells] are inside the cube and free (a piece being moved does
   * not block itself). */
  fits(cells: Iterable<Voxel>, ignoring?: string): boolean {
    const taken = this.occupancy(ignoring)
    for (const c of cells) {
      if (!c.isWithin(this.size) || taken.has(c.key)) return false
    }
    return true
  }

  /** Cells that are neither blocked nor covered. */
  get freeCells(): Voxel[] {
    if (!this.hasPuzzle) return []
    const taken = this.occupancy()
    const out: Voxel[] = []
    const n = this.size
    for (let y = 0; y < n; y++) {
      for (let z = 0; z < n; z++) {
        for (let x = 0; x < n; x++) {
          const v = new Voxel(x, y, z)
          if (!taken.has(v.key)) out.push(v)
        }
      }
    }
    return out
  }

  /** Puts a piece in the cube (or moves it there). Returns `false` and
   * changes nothing if it does not fit. */
  place(id: string, shape: Shape, origin: Voxel): boolean {
    const placement = new CubePlacement(id, shape, origin)
    if (!this.fits(placement.cells, id)) return false
    this.remember(id, placement)
    this.placementsById.set(id, placement)
    this.trayShapes.set(id, shape)
    this.notify()
    return true
  }

  /** Sends a piece back to the tray, keeping its orientation. */
  remove(id: string): void {
    if (!this.placementsById.has(id)) return
    this.remember(id, null)
    this.placementsById.delete(id)
    this.notify()
  }

  private remember(id: string, after: CubePlacement | null): void {
    this.history.push({ pieceId: id, before: this.placementsById.get(id) ?? null, after, trayBefore: this.trayShapes.get(id)! })
    if (this.history.length > CubeGame.historyLength) this.history.shift()
  }

  /** Takes back the newest change to the cube and returns it, or `null`. */
  undo(): CubeMove | null {
    if (!this.canUndo) return null
    const move = this.history.pop()!
    if (move.before) this.placementsById.set(move.pieceId, move.before)
    else this.placementsById.delete(move.pieceId)
    this.trayShapes.set(move.pieceId, move.trayBefore)
    this.notify()
    return move
  }

  /** Every remaining piece at its place in [solution] (auto-solve). */
  applySolution(solution: CubePlacement[]): void {
    this.history.length = 0
    this.placementsById.clear()
    for (const p of solution) {
      this.placementsById.set(p.pieceId, p)
      this.trayShapes.set(p.pieceId, p.shape)
    }
    this.notify()
  }

  /** The piece's current orientation, in the cube or in the tray. */
  shapeOf(id: string): Shape {
    return this.placementsById.get(id)?.shape ?? this.trayShapes.get(id)!
  }

  /** Turns a piece [turns] quarter turns about [axis]. */
  turn(id: string, axis: number, turns = 1): boolean {
    return this.reorient(id, Shapes.rotate(this.shapeOf(id), axis, turns))
  }

  /** Gives a piece a new orientation. In the tray it simply turns; in the
   * cube it stays as close to where it was as the cube allows. */
  reorient(id: string, shape: Shape): boolean {
    if (!this.pieceById(id).hasOrientation(shape)) return false
    const current = this.placementsById.get(id)
    if (!current) {
      this.trayShapes.set(id, shape)
      this.notify()
      return true
    }
    const origin = this.nearestFit(id, shape, current)
    if (!origin) return false
    return this.place(id, shape, origin)
  }

  /** Moves a placed piece one cell along [axis] in direction [sign]. */
  nudge(id: string, axis: number, sign: number): boolean {
    const current = this.placementsById.get(id)
    if (!current) return false
    return this.place(id, current.shape, current.origin.add(Voxel.unit(axis, sign)))
  }

  /** The origin closest to [from]'s centre where [shape] fits. */
  private nearestFit(id: string, shape: Shape, from: CubePlacement): Voxel | null {
    const centre = centreOf(from.cells)
    const extent = Shapes.extent(shape)
    const n = this.size
    let best: Voxel | null = null
    let bestDistance = Infinity
    for (let x = 0; x <= n - extent.x; x++) {
      for (let y = 0; y <= n - extent.y; y++) {
        for (let z = 0; z <= n - extent.z; z++) {
          const origin = new Voxel(x, y, z)
          const cells = shape.map((c) => c.add(origin))
          if (!this.fits(cells, id)) continue
          const c = centreOf(cells)
          const d = (c[0] - centre[0]) ** 2 + (c[1] - centre[1]) ** 2 + (c[2] - centre[2]) ** 2
          if (d < bestDistance) {
            bestDistance = d
            best = origin
          }
        }
      }
    }
    return best
  }
}

function centreOf(cells: Voxel[]): [number, number, number] {
  const n = cells.length
  return [cells.reduce((s, c) => s + c.x, 0) / n, cells.reduce((s, c) => s + c.y, 0) / n, cells.reduce((s, c) => s + c.z, 0) / n]
}
