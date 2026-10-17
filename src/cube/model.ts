/**
 * The cube's model, as in the mobile app (`lib/cube/cube_model.dart`):
 * cells, shapes and their orientations, pieces, placements and levels.
 * Orders matter (orientations, fill order): the generator, the solver and
 * the hints depend on them, and so does matching the phone's puzzles.
 */

/** One cell of the cube: column [x] (left → right), layer [y] (bottom →
 * top), row [z] (back → front). */
export class Voxel {
  readonly x: number
  readonly y: number
  readonly z: number

  constructor(x: number, y: number, z: number) {
    this.x = x
    this.y = y
    this.z = z
  }

  static readonly zero = new Voxel(0, 0, 0)

  /** The unit step along [axis] (0 = x, 1 = y, 2 = z) in direction [sign]. */
  static unit(axis: number, sign: number): Voxel {
    return axis === 0 ? new Voxel(sign, 0, 0) : axis === 1 ? new Voxel(0, sign, 0) : new Voxel(0, 0, sign)
  }

  get(axis: number): number {
    return axis === 0 ? this.x : axis === 1 ? this.y : this.z
  }

  add(o: Voxel): Voxel {
    return new Voxel(this.x + o.x, this.y + o.y, this.z + o.z)
  }

  sub(o: Voxel): Voxel {
    return new Voxel(this.x - o.x, this.y - o.y, this.z - o.z)
  }

  mul(s: number): Voxel {
    return new Voxel(this.x * s, this.y * s, this.z * s)
  }

  dot(o: Voxel): number {
    return this.x * o.x + this.y * o.y + this.z * o.z
  }

  cross(o: Voxel): Voxel {
    return new Voxel(this.y * o.z - this.z * o.y, this.z * o.x - this.x * o.z, this.x * o.y - this.y * o.x)
  }

  withAxis(axis: number, value: number): Voxel {
    return axis === 0 ? new Voxel(value, this.y, this.z) : axis === 1 ? new Voxel(this.x, value, this.z) : new Voxel(this.x, this.y, value)
  }

  isWithin(size: number): boolean {
    return this.x >= 0 && this.y >= 0 && this.z >= 0 && this.x < size && this.y < size && this.z < size
  }

  /** Position in the solver's fill order: layer by layer, back to front,
   * left to right. */
  index(size: number): number {
    return this.x + size * (this.z + size * this.y)
  }

  equals(o: Voxel | null | undefined): boolean {
    return !!o && o.x === this.x && o.y === this.y && o.z === this.z
  }

  /** A key for sets and maps (JavaScript compares objects by identity). */
  get key(): string {
    return `${this.x},${this.y},${this.z}`
  }

  toString(): string {
    return `Voxel(${this.x}, ${this.y}, ${this.z})`
  }
}

export type Shape = readonly Voxel[]

/** How one view sees the cube, snapped to it: the cube directions nearest
 * the screen's right and up, and the one towards the eye. */
export interface ViewFrame {
  readonly right: Voxel
  readonly up: Voxel
  readonly toward: Voxel
}

/** A set of cells, keyed by [Voxel.key]. */
export class VoxelSet {
  private readonly keys = new Set<string>()

  constructor(cells: Iterable<Voxel> = []) {
    for (const c of cells) this.keys.add(c.key)
  }

  has(v: Voxel): boolean {
    return this.keys.has(v.key)
  }

  add(v: Voxel): boolean {
    if (this.keys.has(v.key)) return false
    this.keys.add(v.key)
    return true
  }

  delete(v: Voxel): void {
    this.keys.delete(v.key)
  }

  get size(): number {
    return this.keys.size
  }
}

/**
 * Shapes are lists of voxels normalised so the minimum corner is the origin
 * and sorted in fill order (so the first voxel is the anchor the solver
 * places on the first empty cell).
 */
export const Shapes = {
  normalize(cells: Iterable<Voxel>): Voxel[] {
    const list = [...cells]
    const minX = Math.min(...list.map((c) => c.x))
    const minY = Math.min(...list.map((c) => c.y))
    const minZ = Math.min(...list.map((c) => c.z))
    return list
      .map((c) => new Voxel(c.x - minX, c.y - minY, c.z - minZ))
      .sort((a, b) => a.y - b.y || a.z - b.z || a.x - b.x)
  },

  /** A quarter turn about [axis] (right-handed, looking from +axis), as many
   * times as [turns], normalised. */
  rotate(shape: Shape, axis: number, turns = 1): Voxel[] {
    let cells: readonly Voxel[] = shape
    const n = (((turns % 4) + 4) % 4)
    for (let i = 0; i < n; i++) {
      cells = cells.map((c) =>
        axis === 0 ? new Voxel(c.x, -c.z, c.y) : axis === 1 ? new Voxel(c.z, c.y, -c.x) : new Voxel(-c.y, c.x, c.z),
      )
    }
    return Shapes.normalize(cells)
  },

  /** The shape turned so that it looks from view [to] the way it looked
   * from view [from], normalised. */
  reframe(shape: Shape, from: ViewFrame, to: ViewFrame): Voxel[] {
    if (from.toward.equals(Voxel.zero) || to.toward.equals(Voxel.zero)) return [...shape]
    return Shapes.normalize(
      shape.map((c) => to.right.mul(c.dot(from.right)).add(to.up.mul(c.dot(from.up))).add(to.toward.mul(c.dot(from.toward)))),
    )
  },

  /** Size of the shape along each axis. */
  extent(shape: Shape): Voxel {
    return new Voxel(
      Math.max(...shape.map((c) => c.x)) + 1,
      Math.max(...shape.map((c) => c.y)) + 1,
      Math.max(...shape.map((c) => c.z)) + 1,
    )
  },

  key(shape: Shape): string {
    return shape.map((c) => `${c.x}${c.y}${c.z}`).join(',')
  },

  /** Every distinct orientation reachable by rotation (24 for a shape with
   * no symmetry), in the mobile app's order. Mirror images never appear. */
  orientations(shape: Shape): Voxel[][] {
    const seen = new Map<string, Voxel[]>()
    const queue: Voxel[][] = [Shapes.normalize(shape)]
    while (queue.length > 0) {
      const next = queue.pop()!
      const k = Shapes.key(next)
      if (seen.has(k)) continue
      seen.set(k, next)
      queue.push(Shapes.rotate(next, 0), Shapes.rotate(next, 1))
    }
    return [...seen.values()]
  },
}

/** A piece of the 3D set. [colorKey] picks its colour from the player's
 * piece skin. */
export class CubePiece {
  readonly id: string
  readonly colorKey: string
  readonly cells: Voxel[]
  readonly orientations: Voxel[][]
  private shapeKeyCache: string | null = null

  constructor(id: string, colorKey: string, cells: Shape) {
    this.id = id
    this.colorKey = colorKey
    this.cells = Shapes.normalize(cells)
    this.orientations = Shapes.orientations(cells)
  }

  get size(): number {
    return this.cells.length
  }

  /** The same for every piece of this shape, however it is turned: pieces
   * that share it are interchangeable. */
  get shapeKey(): string {
    if (this.shapeKeyCache === null) {
      this.shapeKeyCache = this.orientations.map(Shapes.key).reduce((a, b) => (a <= b ? a : b))
    }
    return this.shapeKeyCache
  }

  /** Whether [shape] is this piece in one of its orientations. */
  hasOrientation(shape: Shape): boolean {
    const k = Shapes.key(shape)
    return this.orientations.some((o) => Shapes.key(o) === k)
  }
}

const v = (x: number, y: number, z: number) => new Voxel(x, y, z)

/** The set of the 3×3×3 cube: 24 cells, one non-planar piece (the tripod),
 * no mirror pairs. */
export const CubePieces = {
  domino: new CubePiece('domino', 'domino', [v(0, 0, 0), v(1, 0, 0)]),
  line3: new CubePiece('line3', 'line4', [v(0, 0, 0), v(1, 0, 0), v(2, 0, 0)]),
  corner3: new CubePiece('corner3', 'elbow3', [v(0, 0, 0), v(1, 0, 0), v(0, 0, 1)]),
  ell: new CubePiece('ell', 'elbow4', [v(0, 0, 0), v(1, 0, 0), v(2, 0, 0), v(0, 0, 1)]),
  tee: new CubePiece('tee', 'tee', [v(0, 0, 0), v(1, 0, 0), v(2, 0, 0), v(1, 0, 1)]),
  ess: new CubePiece('ess', 'zigzag', [v(0, 0, 0), v(1, 0, 0), v(1, 0, 1), v(2, 0, 1)]),
  tripod: new CubePiece('tripod', 'flare', [v(0, 0, 0), v(1, 0, 0), v(0, 0, 1), v(0, 1, 0)]),
  get standard(): CubePiece[] {
    return [this.tripod, this.ell, this.tee, this.ess, this.line3, this.corner3, this.domino]
  },
}

/** A piece in the cube: its current [shape] with the shape's origin at
 * [origin]. */
export class CubePlacement {
  readonly pieceId: string
  readonly shape: Shape
  readonly origin: Voxel

  constructor(pieceId: string, shape: Shape, origin: Voxel) {
    this.pieceId = pieceId
    this.shape = shape
    this.origin = origin
  }

  get cells(): Voxel[] {
    return this.shape.map((c) => c.add(this.origin))
  }
}

/** One cube to fill: the cells the dice block (one per layer) and the
 * pieces that fill the rest. */
export class CubeLevel {
  readonly startShapes: ReadonlyMap<string, Shape>
  private solutionCache: CubePlacement[] | null

  constructor(options: {
    size: number
    blocked: Voxel[]
    pieces: CubePiece[]
    key?: string
    startShapes?: Map<string, Shape>
    solution?: CubePlacement[]
    solve?: (level: CubeLevel) => CubePlacement[] | null
  }) {
    this.size = options.size
    this.blocked = options.blocked
    this.pieces = options.pieces
    this.key = options.key ?? ''
    this.startShapes = options.startShapes ?? new Map(options.pieces.map((p) => [p.id, p.cells]))
    this.solutionCache = options.solution ?? null
    this.solveFn = options.solve ?? null
  }

  readonly size: number
  readonly blocked: Voxel[]
  readonly pieces: CubePiece[]
  /** Names this puzzle in the player's records. */
  readonly key: string
  private readonly solveFn: ((level: CubeLevel) => CubePlacement[] | null) | null

  /** One way to fill the cube. Generated cubes know theirs; for the others
   * the solver finds one. */
  get solution(): CubePlacement[] {
    if (this.solutionCache === null) this.solutionCache = this.solveFn?.(this) ?? []
    return this.solutionCache
  }

  get cellCount(): number {
    return this.size ** 3
  }

  pieceById(id: string): CubePiece {
    const piece = this.pieces.find((p) => p.id === id)
    if (!piece) throw new Error(`no piece ${id}`)
    return piece
  }
}
