import { CubePiece, Shapes, Voxel, type Shape } from './model'
import { dartRound } from './math'

/** An orientation and how many quarter turns it is from the prepared one. */
export type Turned = readonly [Shape, number]

/**
 * Where a carried piece goes in (`cube_aim.dart`), given the cell under the
 * finger on the side of the cube the player faces. The piece slides in from
 * the player's side as deep as the way stays free. If it has no room there
 * as turned, the orientation with the fewest quarter turns that fits over
 * the finger is taken instead.
 */
export class CubeAim {
  readonly size: number
  /** Cells already filled (dice and placed pieces), by [Voxel.key]. */
  readonly taken: ReadonlySet<string>
  /** The axis the player looks along, and which way (towards the eye). */
  readonly axis: number
  readonly sign: number
  /** The finger over the facing side, in cell units per [across] axis. */
  readonly finger: ReadonlyMap<number, number>
  readonly across: number[]

  constructor(options: { size: number; taken: ReadonlySet<string>; axis: number; sign: number; finger: ReadonlyMap<number, number> }) {
    this.size = options.size
    this.taken = options.taken
    this.axis = options.axis
    this.sign = options.sign
    this.finger = options.finger
    this.across = [0, 1, 2].filter((a) => a !== options.axis)
  }

  fits(shape: Shape, origin: Voxel): boolean {
    return shape.every((c) => {
      const v = c.add(origin)
      return v.isWithin(this.size) && !this.taken.has(v.key)
    })
  }

  at(plane: ReadonlyMap<number, number>, depth: number): Voxel {
    return new Voxel(
      this.axis === 0 ? depth : plane.get(0)!,
      this.axis === 1 ? depth : plane.get(1)!,
      this.axis === 2 ? depth : plane.get(2)!,
    )
  }

  /** Entering from the player's side, as deep as the way stays free. */
  slide(shape: Shape, plane: ReadonlyMap<number, number>): Voxel | null {
    const room = this.size - Shapes.extent(shape).get(this.axis)
    const depths: number[] = []
    for (let d = 0; d <= room; d++) depths.push(d)
    const order = this.sign > 0 ? depths.reverse() : depths
    const first = order.findIndex((d) => this.fits(shape, this.at(plane, d)))
    if (first < 0) return null
    let last = first
    while (last + 1 < order.length && this.fits(shape, this.at(plane, order[last + 1]))) last++
    return this.at(plane, order[last])
  }

  /** The piece's box centred on the finger, kept inside the cube. */
  centred(shape: Shape): Map<number, number> {
    const extent = Shapes.extent(shape)
    const plane = new Map<number, number>()
    for (const a of this.across) {
      const value = dartRound(this.finger.get(a)! - (extent.get(a) - 1) / 2)
      plane.set(a, Math.min(Math.max(value, 0), this.size - extent.get(a)))
    }
    return plane
  }

  /** The nearest the player's side for [shape], fitting or not. */
  front(shape: Shape): Voxel {
    return this.at(this.centred(shape), this.sign > 0 ? this.size - Shapes.extent(shape).get(this.axis) : 0)
  }

  /** The shape and position the piece takes, or `null` if no orientation
   * fits over the finger. */
  place(turns: readonly Turned[]): { shape: Shape; origin: Voxel } | null {
    const prepared = turns[0][0]
    const direct = this.slide(prepared, this.centred(prepared))
    if (direct) return { shape: prepared, origin: direct }
    // Fewest turns first, then covering the cell under the finger as close
    // to centred as possible.
    const cell = new Map<number, number>()
    for (const a of this.across) cell.set(a, Math.min(Math.max(dartRound(this.finger.get(a)!), 0), this.size - 1))
    let best: { shape: Shape; origin: Voxel } | null = null
    let bestTurns = 0
    let bestShift = 0
    for (const [shape, count] of turns) {
      if (best && count > bestTurns) break
      const extent = Shapes.extent(shape)
      const centre = this.centred(shape)
      const planes = new Map<string, Map<number, number>>()
      for (const c of shape) {
        const o = new Map<number, number>()
        for (const a of this.across) o.set(a, cell.get(a)! - c.get(a))
        if (this.across.every((a) => o.get(a)! >= 0 && o.get(a)! <= this.size - extent.get(a))) {
          planes.set(this.across.map((a) => o.get(a)).join(','), o)
        }
      }
      for (const o of planes.values()) {
        const origin = this.slide(shape, o)
        if (!origin) continue
        const shift = this.across.reduce((s, a) => s + Math.abs(o.get(a)! - centre.get(a)!), 0)
        if (!best || shift < bestShift) {
          best = { shape, origin }
          bestTurns = count
          bestShift = shift
        }
      }
    }
    return best
  }

  /** [piece]'s orientations, fewest quarter turns (about any axis) from
   * [from] first. */
  static byTurns(piece: CubePiece, from: Shape): Turned[] {
    const known = new Map(piece.orientations.map((o) => [Shapes.key(o), o] as const))
    const start = known.get(Shapes.key(from)) ?? from
    const distance = new Map([[Shapes.key(start), 0]])
    const order: Turned[] = [[start, 0]]
    for (let i = 0; i < order.length; i++) {
      const [shape, d] = order[i]
      for (let axis = 0; axis < 3; axis++) {
        for (const turns of [1, 3]) {
          const next = Shapes.rotate(shape, axis, turns)
          const key = Shapes.key(next)
          if (distance.has(key)) continue
          distance.set(key, d + 1)
          order.push([known.get(key) ?? next, d + 1])
        }
      }
    }
    return order
  }
}
