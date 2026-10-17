import { CubeCamera, V3, type Projected } from './camera'
import { boundsOf, dist, polygonContains, rectDeflate, rectOverlaps, rectUnion, sub, type Pt, type Rect } from './geometry'
import { dartRound } from './math'
import { Voxel, VoxelSet } from './model'

/** What a solid is: how it is drawn and whether it can be picked up. */
export type SolidKind = 'die' | 'piece' | 'held' | 'ghost' | 'hint'

/** A piece caught mid-change: drawn turned [angle] radians about [axis]
 * around the centre of its cells, then moved by [shift]. */
export class SolidMotion {
  readonly axis: number
  readonly angle: number
  readonly shift: V3

  constructor(axis = 0, angle = 0, shift: V3 = V3.zero) {
    this.axis = axis
    this.angle = angle
    this.shift = shift
  }

  private turn(d: V3): V3 {
    const c = Math.cos(this.angle)
    const s = Math.sin(this.angle)
    if (this.axis === 0) return new V3(d.x, d.y * c - d.z * s, d.y * s + d.z * c)
    if (this.axis === 1) return new V3(d.x * c + d.z * s, d.y, -d.x * s + d.z * c)
    return new V3(d.x * c - d.y * s, d.x * s + d.y * c, d.z)
  }

  point(p: V3, pivot: V3): V3 {
    return pivot.add(this.turn(p.sub(pivot))).add(this.shift)
  }

  /** A face direction. */
  direction(d: V3): V3 {
    return this.turn(d)
  }
}

export interface SolidOptions {
  kind: SolidKind
  id: string
  cells: readonly Voxel[]
  colorKey: string
  /** World translation (the held piece floating or lifted). */
  offset?: V3
  /** A turn or step in progress. */
  motion?: SolidMotion | null
  /** An outline that cannot be placed (drawn red). */
  invalid?: boolean
  /** Throws a shadow straight down (the piece in the player's hand). */
  castsShadow?: boolean
}

/** A connected body drawn as one: a die, a piece in the cube, the piece in
 * the player's hand, or an outline. */
export class Solid {
  readonly kind: SolidKind
  readonly id: string
  readonly cells: readonly Voxel[]
  readonly colorKey: string
  readonly offset: V3
  readonly motion: SolidMotion | null
  readonly invalid: boolean
  readonly castsShadow: boolean
  /** 1 = solid; lower values let the player see through. */
  alpha = 1
  selected = false
  /** 0..1: a red flash, as when it does not fit. */
  refused = 0
  private readonly set: VoxelSet

  constructor(options: SolidOptions) {
    this.kind = options.kind
    this.id = options.id
    this.cells = options.cells
    this.colorKey = options.colorKey
    this.offset = options.offset ?? V3.zero
    this.motion = options.motion ?? null
    this.invalid = options.invalid ?? false
    this.castsShadow = options.castsShadow ?? false
    this.set = new VoxelSet(options.cells)
  }

  has(v: Voxel): boolean {
    return this.set.has(v)
  }
}

/** One visible square face of a voxel, in screen space. */
export class SceneFace {
  readonly solid: Solid
  readonly cell: Voxel
  /** Screen corners in order; edge i runs from corner i to corner i + 1. */
  readonly corners: Pt[]
  /** Whether edge i is on the outline of the solid (drawn) rather than a
   * seam between two of its own cells (hidden). */
  readonly boundary: boolean[]
  /** Camera-space depth of the face centre (larger = nearer). */
  readonly depth: number
  readonly normal: V3
  /** 0..1 lighting from the fixed key light. */
  readonly light: number
  readonly worldAxis: number
  readonly worldSign: number
  readonly worldNormal: V3
  /** 0..1: how brightly a passing light wave lights it. */
  readonly glow: number
  /** 0..1: the shadow of the piece in the player's hand on this face. */
  shadow = 0
  sideBounds: Rect | null = null
  private grown: Pt[] | null = null
  private box: Rect | null = null

  constructor(f: {
    solid: Solid
    cell: Voxel
    corners: Pt[]
    boundary: boolean[]
    depth: number
    normal: V3
    light: number
    worldAxis: number
    worldSign: number
    worldNormal: V3
    glow: number
  }) {
    this.solid = f.solid
    this.cell = f.cell
    this.corners = f.corners
    this.boundary = f.boundary
    this.depth = f.depth
    this.normal = f.normal
    this.light = f.light
    this.worldAxis = f.worldAxis
    this.worldSign = f.worldSign
    this.worldNormal = f.worldNormal
    this.glow = f.glow
  }

  get centre(): Pt {
    const c = this.corners
    return { x: (c[0].x + c[1].x + c[2].x + c[3].x) / 4, y: (c[0].y + c[1].y + c[2].y + c[3].y) / 4 }
  }

  get bounds(): Rect {
    return (this.box ??= boundsOf(this.corners))
  }

  /** The whole flat side of the piece this face belongs to. */
  get shadeBounds(): Rect {
    return this.sideBounds ?? this.bounds
  }

  /** [corners] pushed out by about half a pixel, so neighbouring faces of
   * one piece overlap instead of leaving an anti-aliased seam. */
  get grownCorners(): Pt[] {
    if (!this.grown) {
      const c = this.centre
      this.grown = this.corners.map((p) => {
        const d = sub(p, c)
        const length = Math.max(dist(d), 1e-6)
        return { x: p.x + (d.x / length) * 0.6, y: p.y + (d.y / length) * 0.6 }
      })
    }
    return this.grown
  }
}

/** A free cell: its centre on screen, and whether something solid stands
 * between it and the player. */
export interface SceneDot {
  readonly offset: Pt
  readonly scale: number
  readonly hidden: boolean
}

/** A soft shadow on the floor. */
export interface SceneShadow {
  readonly areas: Pt[][]
  readonly alpha: number
  readonly blur: number
}

/** An arrow handle of the selected piece. */
export interface GizmoHandle {
  readonly axis: number
  readonly sign: number
  readonly from: Pt
  readonly root: Pt
  readonly to: Pt
  readonly cellPixels: number
}

export interface SceneOptions {
  size: number
  solids: Solid[]
  camera: CubeCamera
  centre: Pt
  scale: number
  explode?: number
  xray?: boolean
  selectedId?: string | null
  showHandles?: boolean
  freeCells?: readonly Voxel[]
  grid?: boolean
  floorGrid?: boolean
  wave?: number | null
}

/** Light from the upper left, in front of the cube, fixed to the screen. */
const light = new V3(-0.35, 0.78, 0.52).normalized
const corners4: readonly (readonly [number, number])[] = [[-1, -1], [1, -1], [1, 1], [-1, 1]]
const rayStarts: readonly (readonly [number, number, number])[] = [
  [0, 0, 0],
  [-0.35, -0.35, -0.35],
  [0.35, -0.35, -0.35],
  [-0.35, 0.35, -0.35],
  [0.35, 0.35, -0.35],
  [-0.35, -0.35, 0.35],
  [0.35, -0.35, 0.35],
  [-0.35, 0.35, 0.35],
  [0.35, 0.35, 0.35],
]

/**
 * Everything the cube painter draws, projected and sorted back to front
 * (`CubeScene`). Built fresh for every frame; hit testing uses the same
 * geometry, so what you touch is what you see.
 */
export class CubeScene {
  /** How far apart the layers spread when the player separates them. */
  static readonly explodeGap = 0.75

  faces: SceneFace[] = []
  /** Drawn on top of everything: the outline, the hint and the held piece. */
  overlay: SceneFace[] = []
  dots: SceneDot[] = []
  handles: GizmoHandle[] = []
  plateTop: Pt[] = []
  plateSides: Pt[][] = []
  wells: Pt[][] = []
  bounds: [Pt, Pt][] = []
  gridPlanes: Pt[][] = []
  gridLines: [Pt, Pt, boolean][] = []
  viewFromAbove = true
  shadows: SceneShadow[] = []

  static build(o: SceneOptions): CubeScene {
    const scene = new CubeScene()
    const { size, solids, camera, centre, scale } = o
    const explode = o.explode ?? 0
    const xray = o.xray ?? false
    const selectedId = o.selectedId ?? null
    const showHandles = o.showHandles ?? true
    const freeCells = o.freeCells ?? []
    const grid = o.grid ?? false
    const floorGrid = o.floorGrid ?? true
    const wave = o.wave ?? null
    const h = (size - 1) / 2
    const glowAt = (v: Voxel) => {
      if (wave === null) return 0
      const d = Math.abs(v.y + 0.5 - wave) / 1.4
      return d >= 1 ? 0 : 0.5 + 0.5 * Math.cos(Math.PI * d)
    }
    const world = (v: Voxel, offset: V3) =>
      new V3(v.x - h + offset.x, v.y - h + (v.y - h) * CubeScene.explodeGap * explode + offset.y, v.z - h + offset.z)
    const p = (w: V3): Projected => camera.project(w, centre, scale)

    const base: SceneFace[] = []
    const overlay: SceneFace[] = []
    const flats = new Map<string, SceneFace[]>()
    const layered = explode > 0.01
    solids.forEach((solid, solidIndex) => {
      const target = solid.kind === 'held' || solid.kind === 'ghost' || solid.kind === 'hint' ? overlay : base
      const motion = solid.motion
      const pivot = motion
        ? solid.cells.map((v) => world(v, solid.offset)).reduce((a, b) => a.add(b)).mul(1 / solid.cells.length)
        : V3.zero
      const move = (q: V3) => (motion ? motion.point(q, pivot) : q)
      for (const v of solid.cells) {
        for (let axis = 0; axis < 3; axis++) {
          for (const sign of [-1, 1]) {
            const step = Voxel.unit(axis, sign)
            const splitByLayers = axis === 1 && layered
            if (solid.has(v.add(step)) && !splitByLayers) continue
            const out = V3.axis(axis, sign)
            const facing = motion ? motion.direction(out) : out
            const normal = camera.toCamera(facing)
            if (normal.z <= 0.002) continue
            const c = world(v, solid.offset).add(V3.axis(axis, 0.5 * sign))
            const u = (axis + 1) % 3
            const w = (axis + 2) % 3
            const corners = corners4.map(([a, b]) => p(move(c.add(V3.axis(u, 0.5 * a)).add(V3.axis(w, 0.5 * b)))).offset)
            const seam = (edgeAxis: number, edgeSign: number) => {
              if (edgeAxis === 1 && layered) return false
              const across = v.add(Voxel.unit(edgeAxis, edgeSign))
              return solid.has(across) && !(solid.has(across.add(step)) && !splitByLayers)
            }
            const face = new SceneFace({
              solid,
              cell: v,
              corners,
              boundary: [!seam(w, -1), !seam(u, 1), !seam(w, 1), !seam(u, -1)],
              depth: camera.toCamera(move(c)).z,
              normal,
              light: Math.max(0, normal.dot(light)),
              worldAxis: axis,
              worldSign: sign,
              worldNormal: facing,
              glow: solid.kind === 'piece' ? glowAt(v) : 0,
            })
            target.push(face)
            const layer = layered && axis !== 1 ? v.y : -1
            const key = `${solidIndex}|${axis}|${sign}|${v.get(axis)}|${layer}`
            const side = flats.get(key)
            if (side) side.push(face)
            else flats.set(key, [face])
          }
        }
      }
    })
    for (const side of flats.values()) {
      if (side.length < 2) continue
      const r = side.map((f) => f.bounds).reduce(rectUnion)
      for (const f of side) f.sideBounds = r
    }
    base.sort((a, b) => a.depth - b.depth)
    overlay.sort((a, b) => a.depth - b.depth)

    // See-through: x-ray fades every piece; while carrying, only the pieces
    // standing between the player and the outline fade.
    const ghost = overlay.filter((f) => f.solid.kind === 'ghost')
    if (xray) {
      for (const s of solids) if (s.kind === 'piece' && s.id !== selectedId) s.alpha = 0.16
    } else if (ghost.length > 0) {
      const area = ghost.map((f) => f.bounds).reduce(rectUnion)
      const nearest = Math.max(...ghost.map((f) => f.depth))
      for (const f of base) {
        if (f.solid.kind === 'piece' && f.depth > nearest - 0.25 && rectOverlaps(f.bounds, rectDeflate(area, 2))) f.solid.alpha = 0.22
      }
    }
    for (const s of solids) s.selected = s.id === selectedId && s.kind === 'piece'
    // The selected piece shows through whatever stands in front of it.
    const selectedSolid = solids.find((s) => s.selected) ?? null
    const eye = camera.towardsEye
    if (selectedSolid && !xray) {
      const owner = new Map<string, Solid>()
      for (const s of solids) if (s.kind === 'piece' || s.kind === 'die') for (const c of s.cells) owner.set(c.key, s)
      for (const v of selectedSolid.cells) {
        for (const [dx, dy, dz] of rayStarts) {
          for (let t = 0.4; t < size * 1.8; t += 0.25) {
            const cell = new Voxel(dartRound(v.x + dx + eye.x * t), dartRound(v.y + dy + eye.y * t), dartRound(v.z + dz + eye.z * t))
            const hit = owner.get(cell.key)
            // Only what is nearer the player.
            const towards = (cell.x - v.x) * eye.x + (cell.y - v.y) * eye.y + (cell.z - v.z) * eye.z
            if (hit && hit !== selectedSolid && towards > 0.5) hit.alpha = 0.22
          }
        }
      }
    }

    // Free cells: hidden when a solid cell lies between them and the eye.
    const solidCells = new VoxelSet()
    for (const s of solids) if ((s.kind === 'piece' || s.kind === 'die') && s.alpha > 0.5) for (const c of s.cells) solidCells.add(c)
    for (const v of freeCells) {
      const at = p(world(v, V3.zero))
      let hidden = false
      for (let t = 0.6; t < size * 1.8 && !hidden; t += 0.3) {
        const cell = new Voxel(dartRound(v.x + eye.x * t), dartRound(v.y + eye.y * t), dartRound(v.z + eye.z * t))
        if (!cell.equals(v) && solidCells.has(cell)) hidden = true
      }
      scene.dots.push({ offset: at.offset, scale: at.scale, hidden })
    }

    // The board plate under the bottom layer, its wells and the outline.
    const bottom = -h - 0.5 - h * CubeScene.explodeGap * explode - 0.06
    const r = h + 0.5 + 0.28
    const thickness = 0.32
    scene.plateTop = corners4.map(([a, b]) => p(new V3(r * a, bottom, r * b)).offset)
    for (const [axis, sign] of [[0, 1], [0, -1], [2, 1], [2, -1]]) {
      const n = camera.toCamera(V3.axis(axis, sign))
      if (n.z <= 0) continue
      const w = axis === 0 ? 2 : 0
      const a = V3.axis(axis, r * sign)
      scene.plateSides.push([
        p(a.add(V3.axis(w, -r)).add(new V3(0, bottom, 0))).offset,
        p(a.add(V3.axis(w, r)).add(new V3(0, bottom, 0))).offset,
        p(a.add(V3.axis(w, r)).add(new V3(0, bottom - thickness, 0))).offset,
        p(a.add(V3.axis(w, -r)).add(new V3(0, bottom - thickness, 0))).offset,
      ])
    }
    for (let x = 0; x < size; x++) {
      for (let z = 0; z < size; z++) {
        const inset = 0.42
        scene.wells.push(corners4.map(([a, b]) => p(new V3(x - h + inset * a, bottom + 0.001, z - h + inset * b)).offset))
      }
    }

    // Depth cues: the cube's base shadow on the plate, and the held piece's
    // shadow straight down. Only on the cube at rest.
    if (!layered && !xray) {
      const still = (s: Solid) => (s.kind === 'piece' || s.kind === 'die') && s.motion === null && s.offset.equals(V3.zero)
      const standing = new VoxelSet()
      const standingList: Voxel[] = []
      for (const s of solids) if (still(s)) for (const c of s.cells) if (standing.add(c)) standingList.push(c)
      const tops = new Map<string, SceneFace>()
      for (const f of base) if (still(f.solid) && f.worldAxis === 1 && f.worldSign > 0) tops.set(f.cell.key, f)
      const floorSquare = (x: number, z: number, grow: number) =>
        corners4.map(([a, b]) => p(new V3(x - h + (0.5 + grow) * a, bottom + 0.002, z - h + (0.5 + grow) * b)).offset)
      const base0 = standingList.filter((v) => v.y === 0).map((v) => floorSquare(v.x, v.z, 0.06))
      if (base0.length > 0) scene.shadows.push({ areas: base0, alpha: 0.3, blur: 0.12 * scale })
      for (const held of solids.filter((s) => s.castsShadow)) {
        const lowest = new Map<string, { x: number; z: number; y: number }>()
        for (const c of held.cells) {
          const k = `${c.x},${c.z}`
          const known = lowest.get(k)
          if (!known || c.y < known.y) lowest.set(k, { x: c.x, z: c.z, y: c.y })
        }
        for (const { x, z, y: y0 } of lowest.values()) {
          let y = y0 - 1
          while (y >= 0 && !standing.has(new Voxel(x, y, z))) y--
          const gap = y0 - 1 - y
          const alpha = 0.45 / (1 + 0.55 * gap)
          if (y >= 0) {
            const top = tops.get(new Voxel(x, y, z).key)
            if (top) top.shadow = Math.max(top.shadow, alpha)
          } else {
            scene.shadows.push({ areas: [floorSquare(x, z, -0.08)], alpha, blur: (0.08 + 0.05 * gap) * scale })
          }
        }
      }
    }

    const s = h + 0.5
    const boxBottom = -s - h * CubeScene.explodeGap * explode
    const boxTop = s + h * CubeScene.explodeGap * explode
    const box: Pt[] = []
    for (const y of [boxBottom, boxTop]) for (const [a, b] of corners4) box.push(p(new V3(s * a, y, s * b)).offset)
    for (let i = 0; i < 4; i++) {
      scene.bounds.push([box[i], box[(i + 1) % 4]], [box[4 + i], box[4 + ((i + 1) % 4)]], [box[i], box[4 + i]])
    }

    // The corner grid: on each axis the side away from the eye.
    if (grid) {
      const stops = (axis: number) => {
        if (axis !== 1 || !layered) return Array.from({ length: size + 1 }, (_, k) => k - h - 0.5)
        const values: number[] = []
        for (let l = 0; l < size; l++) {
          const c = (l - h) * (1 + CubeScene.explodeGap * explode)
          values.push(c - 0.5, c + 0.5)
        }
        return values
      }
      for (let a = 0; a < 3; a++) {
        const side = eye.get(a) >= 0 ? -1 : 1
        if (a === 1 && side < 0 && !floorGrid) continue
        const at = stops(a)
        const level = side < 0 ? at[0] : at[at.length - 1]
        const u = (a + 1) % 3
        const w = (a + 2) % 3
        const us = stops(u)
        const ws = stops(w)
        const q = (pu: number, pw: number) => p(V3.axis(a, level).add(V3.axis(u, pu)).add(V3.axis(w, pw))).offset
        const ufirst = us[0]
        const ulast = us[us.length - 1]
        const wfirst = ws[0]
        const wlast = ws[ws.length - 1]
        scene.gridPlanes.push([q(ufirst, wfirst), q(ulast, wfirst), q(ulast, wlast), q(ufirst, wlast)])
        us.forEach((b, i) => scene.gridLines.push([q(b, wfirst), q(b, wlast), i === 0 || i === us.length - 1]))
        ws.forEach((b, i) => scene.gridLines.push([q(ufirst, b), q(ulast, b), i === 0 || i === ws.length - 1]))
      }
    }

    // Arrow handles around the selected piece.
    const selected = showHandles ? selectedSolid : null
    if (selected) {
      const cells = selected.cells.map((v) => world(v, V3.zero))
      const mid = cells.reduce((a, b) => a.add(b)).mul(1 / cells.length)
      const from = p(mid).offset
      for (let axis = 0; axis < 3; axis++) {
        const values = selected.cells.map((v) => v.get(axis))
        const half = (Math.max(...values) - Math.min(...values)) / 2 + 0.5
        for (const sign of [-1, 1]) {
          const reach = mid.add(V3.axis(axis, sign * (half + 0.75)))
          const step = dist(sub(p(mid.add(V3.axis(axis, sign))).offset, from))
          const to = p(reach).offset
          if (dist(sub(to, from)) < 18) continue
          scene.handles.push({ axis, sign, from, root: p(mid.add(V3.axis(axis, sign * half))).offset, to, cellPixels: step })
        }
      }
    }

    scene.faces = base
    scene.overlay = overlay
    scene.viewFromAbove = eye.y > -0.05
    return scene
  }

  /** The piece in the cube under [point], nearest first. */
  pieceAt(point: Pt): string | null {
    for (let i = this.faces.length - 1; i >= 0; i--) {
      const f = this.faces[i]
      if (f.solid.kind === 'piece' && polygonContains(f.corners, point)) return f.solid.id
    }
    return null
  }

  /** The arrow handle under [point], if any. */
  handleAt(point: Pt): GizmoHandle | null {
    let best: GizmoHandle | null = null
    let bestDistance = 28
    for (const h of this.handles) {
      const d = dist(sub(h.to, point))
      if (d < bestDistance) {
        bestDistance = d
        best = h
      }
    }
    return best
  }
}
