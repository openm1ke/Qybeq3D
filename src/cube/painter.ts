import { css, lerpColor, shade, white, black, withAlpha, withLightness, type Rgba } from '../rendering/color'
import { pieceColor, type BoardSkin, type DiceSkin, type PieceFinish, type PieceMaterial, type PieceSkin } from '../cosmetics/skins'
import { add, boundsOf, dist, lerpPt, scale, sub, type Pt } from './geometry'
import { GamePalette } from './palette'
import type { CubeScene, SceneFace, Solid } from './scene'

export interface CubeSkins {
  readonly pieces: PieceSkin
  readonly dice: DiceSkin
  readonly board: BoardSkin
}

export interface PaintOptions {
  /** 0..1, drives the hint outline's breathing. */
  pulse?: number
  showPlate?: boolean
  /** The faint outline of the cube's volume. */
  showBounds?: boolean
}

type Ctx = CanvasRenderingContext2D

/** The screen direction the light comes from (up and a little left). */
const lightX = -0.37
const lightY = -0.93

/** How strongly each finish reflects. */
function gloss(finish: PieceFinish): number {
  switch (finish) {
    case 'crystal': return 1.2
    case 'gloss':
    case 'legacy': return 1
    case 'satinMetal': return 0.7
    case 'ceramic': return 0.55
    case 'neon': return 0.45
  }
}

/** The deep body of a neon piece. */
export const neonCore = (color: Rgba, m: PieceMaterial) => withLightness(color, m.core)
/** The lit edge of a neon piece. */
export const neonRim = (color: Rgba, m: PieceMaterial) => shade(color, m.rimLift)

/**
 * Draws a [CubeScene] in the player's skins (`CubePainter`): the same piece
 * colours and finishes, dice and board as on the phone, lit from the upper
 * left.
 */
export function paintCube(ctx: Ctx, scene: CubeScene, skins: CubeSkins, options: PaintOptions = {}): void {
  const painter = new Painter(ctx, scene, skins, options.pulse ?? 0)
  const showPlate = options.showPlate ?? true
  if (showPlate && scene.viewFromAbove) painter.plate(1)
  painter.grid()
  if (scene.viewFromAbove) painter.shadows()
  if (options.showBounds ?? true) painter.boundsLines()
  for (const f of scene.faces) painter.face(f)
  if (showPlate && !scene.viewFromAbove) painter.plate(0.35)
  painter.dots()
  for (const f of scene.overlay) painter.face(f)
  painter.handles()
}

function polygon(ctx: Ctx, points: readonly Pt[]): void {
  ctx.beginPath()
  ctx.moveTo(points[0].x, points[0].y)
  for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y)
  ctx.closePath()
}

function linear(ctx: Ctx, from: Pt, to: Pt, colors: readonly Rgba[], stops?: readonly number[]): CanvasGradient | string {
  // A zero-length gradient would paint nothing at all.
  if (Math.abs(from.x - to.x) < 1e-6 && Math.abs(from.y - to.y) < 1e-6) return css(colors[0])
  const g = ctx.createLinearGradient(from.x, from.y, to.x, to.y)
  colors.forEach((c, i) => g.addColorStop(stops ? stops[i] : i / (colors.length - 1), css(c)))
  return g
}

/** Draws with a Gaussian blur of standard deviation [sigma] (Flutter's
 * `MaskFilter.blur`), using a canvas shadow cast from far off screen so it
 * works in every browser. */
function blurred(ctx: Ctx, sigma: number, color: Rgba, draw: (opaque: Rgba) => void): void {
  const t = ctx.getTransform()
  const ratio = Math.hypot(t.a, t.b) || 1
  const far = 100_000
  ctx.save()
  ctx.shadowColor = css(color)
  ctx.shadowBlur = sigma * 2 * ratio
  ctx.shadowOffsetX = far * ratio
  ctx.translate(-far, 0)
  // The shadow multiplies the shape's alpha by its own: the shape is drawn
  // opaque, the shadow colour carries the alpha.
  draw(withAlpha(color, 1))
  ctx.restore()
}

class Painter {
  private readonly ctx: Ctx
  private readonly scene: CubeScene
  private readonly pieces: PieceSkin
  private readonly diceSkin: DiceSkin
  private readonly board: BoardSkin
  private readonly pulse: number
  private readonly dieFaces = new Map<Solid, SceneFace[]>()
  private readonly bodiesDrawn = new Set<Solid>()

  constructor(ctx: Ctx, scene: CubeScene, skins: CubeSkins, pulse: number) {
    this.ctx = ctx
    this.scene = scene
    this.pieces = skins.pieces
    this.diceSkin = skins.dice
    this.board = skins.board
    this.pulse = pulse
    for (const f of [...scene.faces, ...scene.overlay]) {
      if (f.solid.kind !== 'die') continue
      const list = this.dieFaces.get(f.solid)
      if (list) list.push(f)
      else this.dieFaces.set(f.solid, [f])
    }
  }

  plate(alpha: number): void {
    const { ctx, board } = this
    for (const side of this.scene.plateSides) {
      polygon(ctx, side)
      ctx.fillStyle = css(withAlpha(shade(board.frameBottom, -0.04), alpha))
      ctx.fill()
    }
    const top = this.scene.plateTop
    const r = boundsOf(top)
    polygon(ctx, top)
    ctx.fillStyle = linear(ctx, { x: (r.left + r.right) / 2, y: r.top }, { x: (r.left + r.right) / 2, y: r.bottom }, [
      withAlpha(board.frameTop, alpha),
      withAlpha(board.frameBottom, alpha),
    ])
    ctx.fill()
    ctx.lineWidth = 1
    ctx.strokeStyle = css(board.frameEdge)
    ctx.stroke()
    if (board.frameGlow) {
      const glow = board.frameGlow
      blurred(ctx, 6, glow, (opaque) => {
        polygon(ctx, top)
        ctx.lineWidth = 3
        ctx.strokeStyle = css(opaque)
        ctx.stroke()
      })
    }
    for (const well of this.scene.wells) {
      polygon(ctx, well)
      ctx.fillStyle = css(withAlpha(board.well, alpha))
      ctx.fill()
      ctx.lineWidth = 1
      ctx.strokeStyle = css(board.lipBottom)
      ctx.stroke()
    }
  }

  /** The corner the cube sits in: faint walls, cell lines, brighter borders. */
  grid(): void {
    const { ctx, scene } = this
    if (scene.gridPlanes.length === 0) return
    ctx.fillStyle = css(withAlpha(GamePalette.textPrimary, 0.025))
    for (const plane of scene.gridPlanes) {
      polygon(ctx, plane)
      ctx.fill()
    }
    for (const [a, b, edge] of scene.gridLines) {
      ctx.beginPath()
      ctx.moveTo(a.x, a.y)
      ctx.lineTo(b.x, b.y)
      ctx.lineWidth = edge ? 1.2 : 1
      ctx.strokeStyle = css(withAlpha(GamePalette.textPrimary, edge ? 0.16 : 0.07))
      ctx.stroke()
    }
  }

  boundsLines(): void {
    const { ctx } = this
    ctx.lineWidth = 1
    ctx.strokeStyle = css(withAlpha(GamePalette.textPrimary, 0.07))
    for (const [a, b] of this.scene.bounds) {
      ctx.beginPath()
      ctx.moveTo(a.x, a.y)
      ctx.lineTo(b.x, b.y)
      ctx.stroke()
    }
  }

  face(f: SceneFace): void {
    switch (f.solid.kind) {
      case 'die': this.dieFace(f); break
      case 'ghost':
      case 'hint': this.outlineFace(f); break
      case 'piece':
      case 'held': this.pieceFace(f); break
    }
  }

  /** One side of a piece as a polished slab: a darker bevel along its outer
   * edges (lit along the top, shaded along the bottom), the face with
   * rounded outer corners, a sheen from the top and a glossy band. */
  private pieceFace(f: SceneFace): void {
    const { ctx } = this
    const solid = f.solid
    const m = this.pieces.material
    const color = pieceColor(this.pieces, solid.colorKey)
    const alpha = solid.alpha
    const lit = shade(color, -0.2 * (1 - f.light))
    const rect = f.shadeBounds
    const top = { x: (rect.left + rect.right) / 2, y: rect.top }
    const bottom = { x: (rect.left + rect.right) / 2, y: rect.bottom }
    const topLeft = { x: rect.left, y: rect.top }
    const bottomRight = { x: rect.right, y: rect.bottom }

    let fill: CanvasGradient | string
    switch (m.finish) {
      case 'neon': {
        const core = neonCore(color, m)
        fill = linear(ctx, top, bottom, [withAlpha(shade(core, 0.05 * f.light), alpha), withAlpha(shade(core, -0.04), alpha)])
        break
      }
      case 'satinMetal':
        fill = linear(ctx, topLeft, bottomRight, [
          withAlpha(shade(lit, -0.06), alpha),
          withAlpha(shade(lit, 0.12), alpha),
          withAlpha(shade(lit, -0.08), alpha),
        ], [0, 0.45, 1])
        break
      default:
        fill = linear(ctx, top, bottom, [withAlpha(shade(lit, m.faceLift), alpha), withAlpha(shade(lit, -m.faceDrop), alpha)])
    }

    if (alpha < 1) {
      // See-through: a plain pane, so what is behind stays readable.
      polygon(ctx, f.corners)
      ctx.fillStyle = fill
      ctx.fill()
    } else {
      const g = gloss(m.finish)
      // The bevel: the whole face in a deeper shade first.
      polygon(ctx, f.grownCorners)
      ctx.fillStyle = css(m.finish === 'neon' ? shade(color, -0.25) : shade(lit, -0.13))
      ctx.fill()
      const inner = inset(f, 0.1)
      const c = f.corners
      const centre = f.centre
      for (let i = 0; i < 4; i++) {
        if (!f.boundary[i]) continue
        const j = (i + 1) % 4
        // Lit where the edge faces up, shaded where it faces down.
        const out = sub(scale(add(c[i], c[j]), 0.5), centre)
        const length = dist(out)
        const facing = length === 0 ? 0 : (out.x * lightX + out.y * lightY) / length
        polygon(ctx, [c[i], c[j], inner[j], inner[i]])
        ctx.fillStyle = facing > 0 ? css(withAlpha(white, (0.1 + 0.32 * facing) * g)) : css(withAlpha(black, 0.22 * -facing))
        ctx.fill()
      }
      const face = () => rounded(ctx, inner, [0, 1, 2, 3].map((i) => f.boundary[(i + 3) % 4] && f.boundary[i]), 0.32)
      face()
      ctx.fillStyle = fill
      ctx.fill()
      this.depth(f)

      if (m.finish === 'crystal') {
        // A facet across the face, as the 2D gems split each cell.
        polygon(ctx, [inner[0], inner[1], inner[2]])
        ctx.fillStyle = css(withAlpha(white, 0.08))
        ctx.fill()
      }
      if (f.normal.y > 0.35 && m.sheen > 0) {
        face()
        ctx.fillStyle = linear(ctx, top, bottom, [withAlpha(white, m.sheen * 0.55), withAlpha(white, 0)])
        ctx.fill()
      }
      // The glossy band: a reflection across the side from its lit corner,
      // with a crisp lower edge like polished plastic.
      if (f.light > 0.15) {
        const strength = g * (0.06 + 0.2 * f.light)
        face()
        ctx.fillStyle = linear(ctx, topLeft, bottomRight, [
          withAlpha(white, strength),
          withAlpha(white, strength * 0.35),
          withAlpha(white, 0),
          withAlpha(white, 0),
        ], [0, 0.36, 0.38, 1])
        ctx.fill()
      }
      if (solid.refused > 0) {
        // "No": a red wash and a red glow along its outline.
        polygon(ctx, f.grownCorners)
        ctx.fillStyle = css(withAlpha(GamePalette.invalid, 0.12 * solid.refused))
        ctx.fill()
        const glowColor = withAlpha(GamePalette.invalid, 0.7 * solid.refused)
        blurred(ctx, 3, glowColor, (opaque) => this.edges(f, 5, opaque))
        this.edges(f, 1.8, withAlpha(GamePalette.invalid, solid.refused), 'round')
      }
      if (f.glow > 0) {
        // A light wave passing through: the face lights up in its own
        // colour, and its outline glows.
        ctx.save()
        ctx.globalCompositeOperation = 'screen'
        polygon(ctx, f.grownCorners)
        ctx.fillStyle = css(withAlpha(lerpColor(color, white, 0.3), 0.75 * f.glow))
        ctx.fill()
        ctx.restore()
        const glowColor = withAlpha(white, 0.5 * f.glow)
        blurred(ctx, 2, glowColor, (opaque) => this.edges(f, 3, opaque))
      }
    }

    switch (m.finish) {
      case 'neon': {
        const glowColor = withAlpha(color, m.innerGlow * 0.5)
        blurred(ctx, 3, glowColor, (opaque) => this.edges(f, 4, opaque))
        this.edges(f, 1.8, withAlpha(neonRim(color, m), Math.max(alpha, 0.85)), 'round')
        break
      }
      case 'ceramic':
        this.edges(f, 1.3, withAlpha(css2(0xfff6eedd), alpha < 1 ? 0.85 : 0.6), 'round')
        break
      default:
        this.edges(f, alpha < 1 ? 1.4 : 0.9, alpha < 1 ? withAlpha(shade(color, 0.12), 0.9) : withAlpha(shade(color, -0.3), 0.55), 'round')
    }
    if (solid.selected) this.edges(f, 2.2, withAlpha(GamePalette.textPrimary, 0.9))
  }

  /** Soft shadows on the floor. */
  shadows(): void {
    const { ctx } = this
    for (const shadow of this.scene.shadows) {
      const color = withAlpha(black, shadow.alpha)
      blurred(ctx, Math.max(0.5, shadow.blur), color, (opaque) => {
        ctx.beginPath()
        for (const area of shadow.areas) {
          ctx.moveTo(area[0].x, area[0].y)
          for (let i = 1; i < area.length; i++) ctx.lineTo(area[i].x, area[i].y)
          ctx.closePath()
        }
        ctx.fillStyle = css(opaque)
        ctx.fill()
      })
    }
  }

  /** The shadow of the piece in the player's hand, on an opaque face. */
  private depth(f: SceneFace): void {
    if (f.shadow <= 0) return
    const { ctx } = this
    const c = f.corners
    const size = dist(sub(c[0], c[2]))
    const color = withAlpha(black, f.shadow)
    blurred(ctx, 0.08 * size, color, (opaque) => {
      polygon(ctx, inset(f, 0.14, true))
      ctx.fillStyle = css(opaque)
      ctx.fill()
    })
  }

  /** A die: a body with rounded corners (drawn once), and each face as a
   * rounded tile, so the edges read as smooth chamfers. */
  private dieFace(f: SceneFace): void {
    const { ctx } = this
    const dice = this.diceSkin
    const solid = f.solid
    const alpha = solid.alpha
    const shadeAmount = 0.75 + 0.25 * f.light
    const lit = (c: Rgba) => withAlpha(lerpColor(dice.shade, c, shadeAmount), alpha)
    const b = f.bounds
    const top = { x: (b.left + b.right) / 2, y: b.top }
    const bottom = { x: (b.left + b.right) / 2, y: b.bottom }
    if (alpha < 1) {
      // A faded die: a plain pane with a clear outline.
      polygon(ctx, f.corners)
      ctx.fillStyle = linear(ctx, top, bottom, [lit(dice.faceTop), lit(dice.faceBottom)])
      ctx.fill()
      this.edges(f, 1, withAlpha(dice.faceTop, 0.7))
      return
    }
    if (!this.bodiesDrawn.has(solid)) {
      this.bodiesDrawn.add(solid)
      this.dieBody(solid)
    }
    const tile = () => rounded(ctx, inset(f, 0.09, true), [true, true, true, true], 0.3)
    tile()
    ctx.fillStyle = linear(ctx, top, bottom, [lit(dice.faceTop), lit(dice.faceBottom)])
    ctx.fill()
    // A soft gloss from the lit corner.
    if (f.light > 0.15 && dice.sheen > 0) {
      const strength = dice.sheen * (0.3 + 0.5 * f.light)
      tile()
      ctx.fillStyle = linear(ctx, { x: b.left, y: b.top }, { x: b.right, y: b.bottom }, [withAlpha(white, strength), withAlpha(white, 0)], [0, 0.55])
      ctx.fill()
    }
    this.depth(f)
    tile()
    ctx.lineWidth = 0.8
    ctx.strokeStyle = css(dice.outline ?? withAlpha(dice.rim, dice.rimAlpha * f.light + 0.05))
    ctx.stroke()
  }

  /** The die's outline with rounded corners, in its side colour. */
  private dieBody(solid: Solid): void {
    const { ctx } = this
    const dice = this.diceSkin
    const faces = this.dieFaces.get(solid) ?? []
    const h = hull(faces.flatMap((f) => f.corners))
    if (h.length < 3) return
    const body = () => rounded(ctx, h, h.map(() => true), 0.22)
    const b = boundsOf(h)
    if (dice.glow) {
      const glow = dice.glow
      blurred(ctx, 4, glow, (opaque) => {
        body()
        ctx.lineWidth = 4
        ctx.strokeStyle = css(opaque)
        ctx.stroke()
      })
    }
    body()
    ctx.fillStyle = linear(ctx, { x: (b.left + b.right) / 2, y: b.top }, { x: (b.left + b.right) / 2, y: b.bottom }, [
      lerpColor(dice.side, dice.faceTop, 0.35),
      lerpColor(dice.shade, dice.side, 0.55),
    ])
    ctx.fill()
  }

  private outlineFace(f: SceneFace): void {
    const { ctx } = this
    const solid = f.solid
    const hint = solid.kind === 'hint'
    const color = solid.invalid ? GamePalette.invalid : pieceColor(this.pieces, solid.colorKey)
    const strength = hint ? 0.55 + 0.45 * this.pulse : 1
    polygon(ctx, f.corners)
    ctx.fillStyle = css(withAlpha(color, 0.16 * strength))
    ctx.fill()
    ctx.lineWidth = 1.6
    ctx.lineCap = 'round'
    ctx.strokeStyle = css(withAlpha(color, 0.95 * strength))
    for (let i = 0; i < 4; i++) {
      if (f.boundary[i]) dashed(ctx, f.corners[i], f.corners[(i + 1) % 4])
    }
    ctx.lineCap = 'butt'
  }

  dots(): void {
    const { ctx } = this
    for (const hidden of [true, false]) {
      for (const d of this.scene.dots) {
        if (d.hidden !== hidden) continue
        // Small and quiet: a hint of where the room is, not a pattern.
        const r = 2 * d.scale
        const a = hidden ? 0.3 : 1
        ctx.beginPath()
        ctx.arc(d.offset.x, d.offset.y, r * 2.2, 0, Math.PI * 2)
        ctx.fillStyle = css(withAlpha(GamePalette.accent, 0.07 * a))
        ctx.fill()
        ctx.beginPath()
        ctx.arc(d.offset.x, d.offset.y, r, 0, Math.PI * 2)
        ctx.fillStyle = css(withAlpha(shade(GamePalette.accent, 0.12), 0.6 * a))
        ctx.fill()
      }
    }
  }

  handles(): void {
    const { ctx } = this
    ctx.lineWidth = 1.5
    ctx.lineCap = 'round'
    ctx.strokeStyle = css(withAlpha(GamePalette.textPrimary, 0.22))
    for (const h of this.scene.handles) {
      ctx.beginPath()
      ctx.moveTo(h.root.x, h.root.y)
      ctx.lineTo(h.to.x, h.to.y)
      ctx.stroke()
    }
    ctx.lineCap = 'butt'
    for (const h of this.scene.handles) {
      ctx.beginPath()
      ctx.arc(h.to.x, h.to.y, 9.5, 0, Math.PI * 2)
      ctx.fillStyle = css(withAlpha(GamePalette.surfaceRaised, 0.75))
      ctx.fill()
      ctx.lineWidth = 1.2
      ctx.strokeStyle = css(withAlpha(GamePalette.accent, 0.55))
      ctx.stroke()
      const d = sub(h.to, h.from)
      const length = dist(d) || 1
      const dir = scale(d, 1 / length)
      const normal = { x: -dir.y, y: dir.x }
      const tip = add(h.to, scale(dir, 4))
      const back = sub(h.to, scale(dir, 2.5))
      polygon(ctx, [tip, add(back, scale(normal, 3.8)), sub(back, scale(normal, 3.8))])
      ctx.fillStyle = css(withAlpha(GamePalette.accent, 0.75))
      ctx.fill()
    }
  }

  private edges(f: SceneFace, width: number, color: Rgba, cap: CanvasLineCap = 'butt'): void {
    const { ctx } = this
    ctx.lineWidth = width
    ctx.lineCap = cap
    ctx.lineJoin = 'round'
    ctx.strokeStyle = css(color)
    ctx.beginPath()
    for (let i = 0; i < 4; i++) {
      if (!f.boundary[i]) continue
      const a = f.corners[i]
      const b = f.corners[(i + 1) % 4]
      ctx.moveTo(a.x, a.y)
      ctx.lineTo(b.x, b.y)
    }
    ctx.stroke()
    ctx.lineCap = 'butt'
  }
}

function css2(value: number): Rgba {
  return { a: ((value >>> 24) & 0xff) / 255, r: ((value >>> 16) & 0xff) / 255, g: ((value >>> 8) & 0xff) / 255, b: (value & 0xff) / 255 }
}

/** The face pulled in from its outline edges by [t] of a cell; seams
 * between cells of one piece stay where they are, unless [all]. */
function inset(f: SceneFace, t: number, all = false): Pt[] {
  const c = all ? f.corners : f.grownCorners
  return [0, 1, 2, 3].map((i) => {
    const next = sub(c[(i + 1) % 4], c[i])
    const prev = sub(c[(i + 3) % 4], c[i])
    return add(add(c[i], scale(next, all || f.boundary[(i + 3) % 4] ? t : 0)), scale(prev, all || f.boundary[i] ? t : 0))
  })
}

/** A polygon whose marked corners are rounded off, [r] of the way along
 * each neighbouring edge. */
function rounded(ctx: Ctx, p: readonly Pt[], round: readonly boolean[], r: number): void {
  const n = p.length
  ctx.beginPath()
  for (let i = 0; i < n; i++) {
    const at = p[i]
    if (!round[i]) {
      if (i === 0) ctx.moveTo(at.x, at.y)
      else ctx.lineTo(at.x, at.y)
      continue
    }
    const from = lerpPt(at, p[(i + n - 1) % n], r)
    const to = lerpPt(at, p[(i + 1) % n], r)
    if (i === 0) ctx.moveTo(from.x, from.y)
    else ctx.lineTo(from.x, from.y)
    ctx.quadraticCurveTo(at.x, at.y, to.x, to.y)
  }
  ctx.closePath()
}

/** Convex hull, counter-clockwise (monotone chain). */
function hull(points: readonly Pt[]): Pt[] {
  const ps = [...points].sort((a, b) => (a.x !== b.x ? a.x - b.x : a.y - b.y))
  if (ps.length < 3) return ps
  const cross = (o: Pt, a: Pt, b: Pt) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x)
  const lower: Pt[] = []
  const upper: Pt[] = []
  for (const p of ps) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0.01) lower.pop()
    lower.push(p)
  }
  for (let i = ps.length - 1; i >= 0; i--) {
    const p = ps[i]
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0.01) upper.pop()
    upper.push(p)
  }
  lower.pop()
  upper.pop()
  return [...lower, ...upper]
}

function dashed(ctx: Ctx, a: Pt, b: Pt): void {
  const dash = 5
  const gap = 4
  const length = dist(sub(b, a))
  if (length === 0) return
  const dir = scale(sub(b, a), 1 / length)
  ctx.beginPath()
  for (let d = 0; d < length; d += dash + gap) {
    const from = add(a, scale(dir, d))
    const to = add(a, scale(dir, Math.min(d + dash, length)))
    ctx.moveTo(from.x, from.y)
    ctx.lineTo(to.x, to.y)
  }
  ctx.stroke()
}
