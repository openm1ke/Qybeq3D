import { CubePiece, CubePlacement, Voxel, VoxelSet } from './model'

/**
 * Exact cover for the cube (`cube_solver.dart`): always fills the first empty
 * cell in fill order with a piece whose anchor (first voxel) lands on it, so
 * every branch is forced. Bigger cubes get a [maxSteps] budget so a hint
 * never stalls the game.
 */
export class CubeSolver {
  readonly size: number
  readonly blocked: VoxelSet
  readonly pieces: CubePiece[]
  /** Pieces already in the cube that the solution must keep. */
  readonly fixed: CubePlacement[]
  /** How many placements to try before giving up; `null` searches to the end. */
  readonly maxSteps: number | null
  private steps = 0

  constructor(options: {
    size: number
    blocked: Iterable<Voxel>
    pieces: CubePiece[]
    fixed?: CubePlacement[]
    maxSteps?: number | null
  }) {
    this.size = options.size
    this.blocked = new VoxelSet(options.blocked)
    this.blockedList = [...options.blocked]
    this.pieces = options.pieces
    this.fixed = options.fixed ?? []
    this.maxSteps = options.maxSteps ?? null
  }

  private readonly blockedList: Voxel[]

  /** Whether the last search ran out of [maxSteps]. */
  get gaveUp(): boolean {
    return this.maxSteps !== null && this.steps >= this.maxSteps
  }

  /** One completion of the cube, or `null` if there is none (or none was
   * found within [maxSteps]). */
  solve(): CubePlacement[] | null {
    let found: CubePlacement[] | null = null
    this.search((solution) => {
      found = solution
      return true
    })
    return found
  }

  /** Number of completions, stopping at [limit]. */
  count(limit = 1000): number {
    let n = 0
    this.search(() => ++n >= limit)
    return n
  }

  private search(onSolution: (solution: CubePlacement[]) => boolean): void {
    this.steps = 0
    const size = this.size
    const cells = size * size * size
    const occupied = new Array<boolean>(cells).fill(false)
    for (const b of this.blockedList) {
      if (b.isWithin(size)) occupied[b.index(size)] = true
    }
    const fixedIds = new Set<string>()
    for (const p of this.fixed) {
      fixedIds.add(p.pieceId)
      for (const c of p.cells) {
        if (!c.isWithin(size) || occupied[c.index(size)]) return
        occupied[c.index(size)] = true
      }
    }
    const free = this.pieces.filter((p) => !fixedIds.has(p.id))
    const area = free.reduce((sum, p) => sum + p.size, 0)
    if (area !== occupied.filter((o) => !o).length) return

    const used = new Array<boolean>(free.length).fill(false)
    const placed: CubePlacement[] = []
    const limit = this.maxSteps
    let stop = false

    const step = (from: number): void => {
      let index = from
      while (index < cells && occupied[index]) index++
      if (index === cells) {
        stop = onSolution([...this.fixed, ...placed])
        return
      }
      const target = new Voxel(index % size, Math.floor(index / (size * size)), Math.floor(index / size) % size)
      // Interchangeable pieces would only repeat the same branches.
      const tried = new Set<string>()
      for (let p = 0; p < free.length && !stop; p++) {
        if (used[p] || tried.has(free[p].shapeKey)) continue
        tried.add(free[p].shapeKey)
        for (const shape of free[p].orientations) {
          if (limit !== null && ++this.steps >= limit) {
            stop = true
            return
          }
          const origin = target.sub(shape[0])
          const covered = shape.map((c) => c.add(origin))
          if (!covered.every((c) => c.isWithin(size) && !occupied[c.index(size)])) continue
          for (const c of covered) occupied[c.index(size)] = true
          used[p] = true
          placed.push(new CubePlacement(free[p].id, shape, origin))
          step(index + 1)
          placed.pop()
          used[p] = false
          for (const c of covered) occupied[c.index(size)] = false
          if (stop) return
        }
      }
    }

    step(0)
  }
}
