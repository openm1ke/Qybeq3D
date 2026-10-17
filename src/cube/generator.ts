import { CubeLevel, CubePiece, CubePieces, CubePlacement, Shapes, Voxel, type Shape } from './model'
import { CubeSolver } from './solver'
import { StableRandom } from './stableRandom'

/**
 * The cubes the game offers (`cube_generator.dart`). The 3×3×3 cube always
 * uses its set of seven pieces; bigger cubes are cut into a new set for
 * every puzzle, so they always have a solution.
 */
export interface CubeFormat {
  readonly size: 3 | 4 | 5
  /** Cells per piece in a cut cube. */
  readonly minPiece: number
  readonly maxPiece: number
  /** Solved within this, unassisted: three stars (milliseconds). */
  readonly fastTimeMs: number
}

export const CubeFormats = {
  three: { size: 3, minPiece: 2, maxPiece: 4, fastTimeMs: 2 * 60_000 },
  four: { size: 4, minPiece: 4, maxPiece: 6, fastTimeMs: 6 * 60_000 },
  five: { size: 5, minPiece: 5, maxPiece: 7, fastTimeMs: 15 * 60_000 },
} as const satisfies Record<string, CubeFormat>

export const allFormats: readonly CubeFormat[] = [CubeFormats.three, CubeFormats.four, CubeFormats.five]

export function formatOf(size: number): CubeFormat {
  return allFormats.find((f) => f.size === size) ?? CubeFormats.three
}

/** The level's own solver (for the 3×3×3 cube, which is not cut). */
export function solveLevel(level: CubeLevel): CubePlacement[] | null {
  return new CubeSolver({ size: level.size, blocked: level.blocked, pieces: level.pieces }).solve()
}

const steps = [
  new Voxel(1, 0, 0),
  new Voxel(-1, 0, 0),
  new Voxel(0, 1, 0),
  new Voxel(0, -1, 0),
  new Voxel(0, 0, 1),
  new Voxel(0, 0, -1),
]

/**
 * Makes the puzzles. A puzzle is named by its format and a seed: the same
 * pair always gives the same cube, on the web and on the phone.
 */
export const CubePuzzles = {
  /** Part of every cut cube's key; bumped whenever cubes are cut differently. */
  version: 1,

  /** The skin colours, in the order cut pieces take them. */
  colorKeys: ['flare', 'elbow4', 'tee', 'zigzag', 'line4', 'elbow3', 'domino', 'square'],

  generate(format: CubeFormat, seed: number): CubeLevel {
    const random = new StableRandom(seed)
    const n = format.size
    // The dice: one per layer, each blocking a cell.
    const blocked: Voxel[] = []
    for (let y = 0; y < n; y++) {
      const x = random.nextInt(n)
      const z = random.nextInt(n)
      blocked.push(new Voxel(x, y, z))
    }
    if (format.size === 3) {
      return new CubeLevel({
        size: 3,
        blocked,
        pieces: CubePieces.standard,
        key: `cube3:${blocked.map((b) => b.index(3)).join('-')}`,
        solve: solveLevel,
      })
    }
    const parts = cut(n, blocked, format, random).sort((a, b) => b.length - a.length)
    const colors = colorParts(parts, n)
    const pieces = parts.map((part, i) => new CubePiece(`p${i}`, colors[i], part))
    // Turned at random, so the tray does not give the answer away.
    const startShapes = new Map<string, Shape>()
    for (const p of pieces) startShapes.set(p.id, p.orientations[random.nextInt(p.orientations.length)])
    return new CubeLevel({
      size: n,
      blocked,
      pieces,
      key: `cube${n}:v${CubePuzzles.version}:${seed}`,
      startShapes,
      solution: parts.map((part, i) => new CubePlacement(pieces[i].id, pieces[i].cells, corner(part))),
    })
  },
}

// Cells of an n-cube as fill-order indices: sets keep insertion order, as
// Dart's do, which the random picks depend on.
const at = (index: number, n: number) => new Voxel(index % n, Math.floor(index / (n * n)), Math.floor(index / n) % n)

function inSet(set: ReadonlySet<number>, v: Voxel, n: number): boolean {
  return v.isWithin(n) && set.has(v.index(n))
}

/**
 * Cuts the free cells into connected pieces of the format's sizes, no piece
 * wider than three cells in any direction. Grows one piece at a time from
 * the hardest cell to reach, and never leaves a pocket that no set of
 * pieces could fill.
 */
function cut(n: number, blockedCells: Voxel[], format: CubeFormat, random: StableRandom): Voxel[][] {
  const blocked = new Set(blockedCells.map((b) => b.index(n)))
  for (let attempt = 0; attempt < 1000; attempt++) {
    const free = new Set<number>()
    for (let i = 0; i < n * n * n; i++) if (!blocked.has(i)) free.add(i)
    const parts: Voxel[][] = []
    while (free.size > 0) {
      const start = hardest(free, n, random)
      let part: Voxel[] | null = null
      for (let tries = 0; tries < 24 && part === null; tries++) {
        const size = format.minPiece + random.nextInt(format.maxPiece - format.minPiece + 1)
        const grown = grow(start, size, free, n, random)
        if (grown.length < format.minPiece) continue
        const grownSet = new Set(grown.map((c) => c.index(n)))
        const rest = new Set([...free].filter((i) => !grownSet.has(i)))
        if (pockets(rest, n).every((p) => fillable(p, format))) part = grown
      }
      if (part === null) break
      for (const c of part) free.delete(c.index(n))
      parts.push(part)
    }
    if (free.size === 0) return parts
  }
  throw new Error(`Could not cut a ${n}x${n}x${n} cube`)
}

/** A free cell with the fewest free neighbours. */
function hardest(free: ReadonlySet<number>, n: number, random: StableRandom): Voxel {
  let best: Voxel[] = []
  let fewest = 7
  for (const i of free) {
    const c = at(i, n)
    const count = steps.filter((s) => inSet(free, c.add(s), n)).length
    if (count < fewest) {
      fewest = count
      best = [c]
    } else if (count === fewest) {
      best.push(c)
    }
  }
  return best[random.nextInt(best.length)]
}

function grow(start: Voxel, size: number, free: ReadonlySet<number>, n: number, random: StableRandom): Voxel[] {
  const part = [start]
  const taken = new Set([start.index(n)])
  while (part.length < size) {
    const options: Voxel[] = []
    for (const c of part) {
      for (const s of steps) {
        const v = c.add(s)
        if (inSet(free, v, n) && !taken.has(v.index(n)) && !options.some((o) => o.equals(v)) && compact([...part, v])) {
          options.push(v)
        }
      }
    }
    if (options.length === 0) break
    // Cells with little room left go first: later they would be hard to reach.
    const weights = options.map((v) => 1 / (1 + steps.filter((s) => {
      const w = v.add(s)
      return inSet(free, w, n) && !taken.has(w.index(n))
    }).length))
    let pick = random.nextDouble() * weights.reduce((a, b) => a + b, 0)
    let i = 0
    while (i < options.length - 1 && pick >= weights[i]) {
      pick -= weights[i]
      i++
    }
    part.push(options[i])
    taken.add(options[i].index(n))
  }
  return part
}

/** No wider than three cells in any direction: it fits the tray and reads
 * as one shape. */
function compact(cells: Voxel[]): boolean {
  for (let a = 0; a < 3; a++) {
    const values = cells.map((c) => c.get(a))
    if (Math.max(...values) - Math.min(...values) > 2) return false
  }
  return true
}

/** The sizes of the connected groups of [cells]. */
function pockets(cells: ReadonlySet<number>, n: number): number[] {
  const seen = new Set<number>()
  const sizes: number[] = []
  for (const start of cells) {
    if (seen.has(start)) continue
    seen.add(start)
    let count = 0
    const queue = [start]
    while (queue.length > 0) {
      const v = at(queue.pop()!, n)
      count++
      for (const s of steps) {
        const w = v.add(s)
        if (inSet(cells, w, n) && !seen.has(w.index(n))) {
          seen.add(w.index(n))
          queue.push(w.index(n))
        }
      }
    }
    sizes.push(count)
  }
  return sizes
}

/** Whether some number of pieces of the format's sizes adds up to [cells]. */
function fillable(cells: number, format: CubeFormat): boolean {
  for (let k = 1; k * format.minPiece <= cells; k++) {
    if (cells <= k * format.maxPiece) return true
  }
  return false
}

/** Colours so that pieces touching each other differ where possible. */
function colorParts(parts: Voxel[][], n: number): string[] {
  const owner = new Map<number, number>()
  parts.forEach((part, i) => part.forEach((c) => owner.set(c.index(n), i)))
  const colors: string[] = []
  const uses = new Map(CubePuzzles.colorKeys.map((k) => [k, 0]))
  parts.forEach((part, i) => {
    const nearby = new Set<string>()
    for (const c of part) {
      for (const s of steps) {
        const w = c.add(s)
        if (!w.isWithin(n)) continue
        const j = owner.get(w.index(n))
        if (j !== undefined && j < i) nearby.add(colors[j])
      }
    }
    const options = CubePuzzles.colorKeys.filter((k) => !nearby.has(k))
    const pool = options.length === 0 ? CubePuzzles.colorKeys : options
    const pick = pool.reduce((a, b) => (uses.get(b)! < uses.get(a)! ? b : a))
    uses.set(pick, uses.get(pick)! + 1)
    colors.push(pick)
  })
  return colors
}

function corner(cells: Voxel[]): Voxel {
  return new Voxel(Math.min(...cells.map((c) => c.x)), Math.min(...cells.map((c) => c.y)), Math.min(...cells.map((c) => c.z)))
}

/** Normalised shape helper, re-exported for callers building parts. */
export const normalize = Shapes.normalize
