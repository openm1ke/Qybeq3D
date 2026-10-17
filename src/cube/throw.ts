import { V3 } from './camera'
import type { Voxel } from './model'
import { StableRandom } from './stableRandom'

/** Where a die is at one moment of the throw, in world space, tumbling
 * [angle] radians about [axis]; [hopping] once on its way to its cell. */
export interface DieFrame {
  readonly position: V3
  readonly axis: number
  readonly angle: number
  readonly hopping: boolean
}

interface Track {
  readonly delay: number
  /** Positions at 60 per second from the drop until it lies still. */
  readonly path: V3[]
  readonly axis: number
  readonly turns: number
}

/**
 * The opening throw (`DiceThrow`). The dice drop in from above the cube,
 * which works as the dice cup: they tumble, bounce off its walls and the
 * plate, and come to rest flat. Then one by one they hop to their cells and
 * settle. Precomputed, so a frame is a lookup; seeded like the phone's.
 */
export class DiceThrow {
  readonly size: number
  readonly cells: readonly Voxel[]
  /** How long the whole throw takes, in seconds. */
  readonly seconds: number
  private readonly tracks: Track[] = []
  private readonly hitTimes: number[] = []
  private readonly moveStart: number
  private static readonly moveGap = 0.1
  private static readonly moveLength = 0.45

  constructor(size: number, cells: readonly Voxel[], seed: number) {
    this.size = size
    this.cells = cells
    const random = new StableRandom(seed)
    const h = (size - 1) / 2
    const floor = -h
    const wall = h
    // Distinct resting spots on the plate.
    const spots: [number, number][] = []
    for (let x = 0; x < size; x++) for (let z = 0; z < size; z++) spots.push([x - h, z - h])
    for (let i = spots.length - 1; i > 0; i--) {
      const j = random.nextInt(i + 1)
      const swap = spots[i]
      spots[i] = spots[j]
      spots[j] = swap
    }
    let lastRest = 0
    for (let i = 0; i < cells.length; i++) {
      const delay = i * 0.12
      const [restX, restZ] = spots[i]
      let x = restX + (random.nextDouble() - 0.5) * size * 0.6
      let z = restZ + (random.nextDouble() - 0.5) * size * 0.6
      let y = h + 4.5 + random.nextDouble() * 1.5
      let vx = (random.nextDouble() - 0.5) * 5
      let vz = (random.nextDouble() - 0.5) * 5
      let vy = -3
      const dt = 1 / 240
      const path: V3[] = []
      let time = 0
      let bounces = 0
      // Gravity, the walls and the plate; it stops once it lies still.
      while (time < 1.6) {
        for (let k = 0; k < 4; k++) {
          vy -= 34 * dt
          x += vx * dt
          y += vy * dt
          z += vz * dt
          if (Math.abs(x) > wall) {
            x = Math.sign(x) * wall
            vx = -vx * 0.6
          }
          if (Math.abs(z) > wall) {
            z = Math.sign(z) * wall
            vz = -vz * 0.6
          }
          if (y < floor) {
            // A real knock, not the last little skips.
            if (vy < -2.5) this.hitTimes.push(delay + time)
            y = floor
            vy = -vy * 0.42
            vx *= 0.7
            vz *= 0.7
            bounces++
          }
          time += dt
        }
        path.push(new V3(x, y, z))
        if (bounces > 0 && y === floor && Math.abs(vy) < 0.6) break
      }
      // Drift the end of the path onto the resting spot.
      const end = path[path.length - 1]
      const drift = new V3(restX - end.x, 0, restZ - end.z)
      for (let k = 0; k < path.length; k++) {
        const s = k / Math.max(1, path.length - 1)
        const p = path[k].add(drift.mul(s * s * (3 - 2 * s)))
        // Still inside the walls.
        path[k] = new V3(Math.min(Math.max(p.x, -wall), wall), p.y, Math.min(Math.max(p.z, -wall), wall))
      }
      path[path.length - 1] = new V3(restX, floor, restZ)
      const axis = random.nextBool() ? 0 : 2
      // A whole number of quarter turns: it lands flat, a face up.
      const turns = (3 + random.nextInt(4)) * (random.nextBool() ? 1 : -1)
      this.tracks.push({ delay, path, axis, turns })
      lastRest = Math.max(lastRest, delay + path.length / 60)
    }
    // A moment lying still, then off to the cells.
    this.moveStart = lastRest + 0.45
    this.seconds = this.moveStart + (cells.length - 1) * DiceThrow.moveGap + DiceThrow.moveLength + 0.1
    this.hitTimes.sort((a, b) => a - b)
  }

  /** When the dice knock on the plate, in seconds from the start. */
  get hits(): readonly number[] {
    return this.hitTimes
  }

  /** Die [i] at [time] seconds into the throw, or `null` before it drops. */
  frame(i: number, time: number): DieFrame | null {
    const track = this.tracks[i]
    const t = time - track.delay
    if (t < 0) return null
    const h = (this.size - 1) / 2
    const rest = track.path[track.path.length - 1]
    const move = time - (this.moveStart + i * DiceThrow.moveGap)
    if (move >= 0) {
      // Hop to its cell.
      const s = Math.min(Math.max(move / DiceThrow.moveLength, 0), 1)
      const e = s * s * (3 - 2 * s)
      const cell = this.cells[i]
      const target = new V3(cell.x - h, cell.y - h, cell.z - h)
      const lift = Math.sin(Math.PI * s) * 1.2
      return { position: rest.add(target.sub(rest).mul(e)).add(new V3(0, lift, 0)), axis: track.axis, angle: 0, hopping: true }
    }
    const k = Math.floor(t * 60)
    const position = k >= track.path.length - 1 ? rest : track.path[k].add(track.path[k + 1].sub(track.path[k]).mul(t * 60 - k))
    const landed = Math.min(Math.max((t * 60) / track.path.length, 0), 1)
    const spin = 1 - (1 - landed) ** 3
    return { position, axis: track.axis, angle: ((track.turns * Math.PI) / 2) * spin, hopping: false }
  }

  /** When die [i] settles in its cell. */
  settlesAt(i: number): number {
    return this.moveStart + i * DiceThrow.moveGap + DiceThrow.moveLength
  }

  /** Whether die [i] has settled in its cell. */
  landed(i: number, time: number): boolean {
    return time >= this.settlesAt(i)
  }
}
