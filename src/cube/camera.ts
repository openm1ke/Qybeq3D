import type { Pt } from './geometry'
import { Voxel, type ViewFrame } from './model'

/** A small 3D vector for the cube's projection (`V3`). */
export class V3 {
  readonly x: number
  readonly y: number
  readonly z: number

  constructor(x: number, y: number, z: number) {
    this.x = x
    this.y = y
    this.z = z
  }

  static readonly zero = new V3(0, 0, 0)

  static axis(axis: number, length: number): V3 {
    return axis === 0 ? new V3(length, 0, 0) : axis === 1 ? new V3(0, length, 0) : new V3(0, 0, length)
  }

  get(axis: number): number {
    return axis === 0 ? this.x : axis === 1 ? this.y : this.z
  }

  add(o: V3): V3 {
    return new V3(this.x + o.x, this.y + o.y, this.z + o.z)
  }

  sub(o: V3): V3 {
    return new V3(this.x - o.x, this.y - o.y, this.z - o.z)
  }

  mul(s: number): V3 {
    return new V3(this.x * s, this.y * s, this.z * s)
  }

  dot(o: V3): number {
    return this.x * o.x + this.y * o.y + this.z * o.z
  }

  get length(): number {
    return Math.sqrt(this.dot(this))
  }

  get normalized(): V3 {
    return this.mul(1 / this.length)
  }

  equals(o: V3): boolean {
    return this.x === o.x && this.y === o.y && this.z === o.z
  }
}

/** A projected point: screen position, depth (larger = nearer the eye) and
 * the perspective scale at that depth. */
export interface Projected {
  readonly offset: Pt
  readonly depth: number
  readonly scale: number
}

/**
 * An orbiting camera around the cube's centre (`CubeCamera`). World axes: x
 * right, y up, z towards the viewer at rest. [yaw] turns the cube about the
 * vertical, [pitch] tilts it towards the viewer.
 */
export class CubeCamera {
  yaw: number
  pitch: number

  /** Eye distance in cell units. */
  static readonly eye = 8
  static readonly restYaw = -0.62
  static readonly restPitch = 0.5

  constructor(yaw = CubeCamera.restYaw, pitch = CubeCamera.restPitch) {
    this.yaw = yaw
    this.pitch = pitch
  }

  orbit(dx: number, dy: number): void {
    this.yaw += dx
    this.pitch = Math.min(Math.max(this.pitch + dy, -1.35), 1.35)
  }

  /** World → camera space (x right, y up, z towards the eye). */
  toCamera(p: V3): V3 {
    const cy = Math.cos(this.yaw)
    const sy = Math.sin(this.yaw)
    const cp = Math.cos(this.pitch)
    const sp = Math.sin(this.pitch)
    const x = p.x * cy + p.z * sy
    const z = -p.x * sy + p.z * cy
    return new V3(x, p.y * cp - z * sp, p.y * sp + z * cp)
  }

  /** Camera → world space (the inverse rotation). */
  toWorld(c: V3): V3 {
    const cy = Math.cos(this.yaw)
    const sy = Math.sin(this.yaw)
    const cp = Math.cos(this.pitch)
    const sp = Math.sin(this.pitch)
    const y = c.y * cp + c.z * sp
    const z = -c.y * sp + c.z * cp
    return new V3(c.x * cy - z * sy, y, c.x * sy + z * cy)
  }

  project(world: V3, centre: Pt, scale: number): Projected {
    const c = this.toCamera(world)
    const f = CubeCamera.eye / (CubeCamera.eye - c.z)
    return { offset: { x: centre.x + c.x * f * scale, y: centre.y - c.y * f * scale }, depth: c.z, scale: f }
  }

  /** Direction from the cube towards the eye, in world space. */
  get towardsEye(): V3 {
    return this.toWorld(new V3(0, 0, 1))
  }

  /** The world axis that points most directly at the eye, and its sign. */
  get facingAxis(): [number, number] {
    return dominant(this.towardsEye)
  }

  get rightAxis(): [number, number] {
    return dominant(this.toWorld(new V3(1, 0, 0)))
  }

  get upAxis(): [number, number] {
    return dominant(this.toWorld(new V3(0, 1, 0)))
  }

  /** The horizontal cube axes nearest the direction towards the eye and the
   * screen's right, ignoring how high the eye is. */
  get facingLevel(): [number, number] {
    return dominant(new V3(-Math.sin(this.yaw), 0, Math.cos(this.yaw)))
  }

  get rightLevel(): [number, number] {
    return dominant(new V3(Math.cos(this.yaw), 0, Math.sin(this.yaw)))
  }

  /** This view snapped to the cube: what is right, up and towards the player. */
  get frame(): ViewFrame {
    const [ra, rs] = this.rightAxis
    const [ua, us] = this.upAxis
    const right = Voxel.unit(ra, rs)
    const up = Voxel.unit(ua, us)
    return { right, up, toward: right.cross(up) }
  }

  /** Where the ray through [screen] meets the plane `world[axis] == at`. */
  hitPlane(screen: Pt, centre: Pt, scale: number, axis: number, at: number): V3 | null {
    const eyeWorld = this.toWorld(new V3(0, 0, CubeCamera.eye))
    const onScreen = this.toWorld(new V3((screen.x - centre.x) / scale, -(screen.y - centre.y) / scale, 0))
    const dir = onScreen.sub(eyeWorld)
    if (Math.abs(dir.get(axis)) < 1e-6) return null
    const t = (at - eyeWorld.get(axis)) / dir.get(axis)
    return eyeWorld.add(dir.mul(t))
  }
}

function dominant(v: V3): [number, number] {
  let axis = 0
  for (let a = 1; a < 3; a++) if (Math.abs(v.get(a)) > Math.abs(v.get(axis))) axis = a
  return [axis, v.get(axis) >= 0 ? 1 : -1]
}
