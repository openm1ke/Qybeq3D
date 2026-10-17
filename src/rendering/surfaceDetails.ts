/** A board cell (the 2D game's pieces; kept for the shared surface art). */
type Cell = { readonly row: number; readonly col: number }
import type { DiceSkin, PieceFinish } from '../cosmetics/skins'
import { argb, black, css, lerpColor, white, withAlpha, type Rgba } from './color'
import { blurred, linearGradient, roundedRect, verticalGradient } from './canvas'
import type { Bounds } from './canvas'
import { DartRandom } from './dartRandom'

/**
 * Fixed, local-space surface artwork (Flutter `SurfaceDetails`). No time or
 * random state at draw time: dragging, rebuilding and reduced motion keep the
 * same surface, and decorations never change the silhouette.
 */

type Ctx = CanvasRenderingContext2D

export function paintPieceSurface(
  ctx: Ctx,
  body: Path2D,
  bounds: Bounds,
  cells: readonly Cell[],
  cellSize: number,
  finish: PieceFinish,
  color: Rgba,
): void {
  if (finish === 'gloss' || finish === 'neon' || finish === 'legacy') return
  ctx.save()
  ctx.clip(body)
  if (finish === 'ceramic') ceramic(ctx, body, bounds, cellSize, color)
  else if (finish === 'satinMetal') metal(ctx, bounds, cellSize)
  else if (finish === 'crystal') {
    for (const cell of cells) {
      crystal(ctx, { left: cell.col * cellSize, top: cell.row * cellSize, right: (cell.col + 1) * cellSize, bottom: (cell.row + 1) * cellSize }, 1)
    }
  }
  ctx.restore()
}

/** Surface of a die face or tile: [radius] is the face's corner radius. */
export function paintDiceSurface(ctx: Ctx, face: Bounds, radius: number, skin: DiceSkin, light = 1): void {
  if (skin.surface === 'smooth') return
  ctx.save()
  ctx.clip(roundedRect(face, radius))
  const width = face.right - face.left
  if (skin.surface === 'ceramic') {
    const d1 = width * 0.09
    const inset = { left: face.left + d1, top: face.top + d1, right: face.right - d1, bottom: face.bottom - d1 }
    ctx.lineWidth = width * 0.016
    ctx.strokeStyle = css(withAlpha(skin.pip, 0.22))
    ctx.stroke(roundedRect(inset, Math.max(0, radius - d1)))
    const d2 = width * 0.045
    const inner = { left: inset.left + d2, top: inset.top + d2, right: inset.right - d2, bottom: inset.bottom - d2 }
    ctx.lineWidth = width * 0.012
    ctx.strokeStyle = css(withAlpha(white, 0.65))
    ctx.stroke(roundedRect(inner, Math.max(0, radius - d1 - d2)))
  } else if (skin.surface === 'stone') {
    stone(ctx, face, light)
  } else if (skin.surface === 'crystal') {
    crystal(ctx, face, light)
  }
  ctx.restore()
}

// Glaze pools gently inside a fine porcelain lip that follows the full
// silhouette, including concave corners.
function ceramic(ctx: Ctx, body: Path2D, bounds: Bounds, unit: number, color: Rgba): void {
  ctx.fillStyle = linearGradient(ctx, bounds, [argb(0x20ffffff), argb(0x38ffffff), argb(0x00ffffff)], {
    begin: [-1, -1],
    end: [1, 1],
    stops: [0, 0.3, 0.7],
  })
  ctx.fillRect(bounds.left, bounds.top, bounds.right - bounds.left, bounds.bottom - bounds.top)
  ctx.lineWidth = unit * 0.17
  ctx.strokeStyle = css(withAlpha(lerpColor(color, argb(0xff4e5360), 0.45), 0.36))
  ctx.stroke(body)
  ctx.lineWidth = unit * 0.14
  ctx.strokeStyle = css(argb(0xc7fff7e6))
  ctx.stroke(body)
  ctx.lineWidth = unit * 0.095
  ctx.strokeStyle = verticalGradient(ctx, bounds, [lerpColor(color, white, 0.48), color])
  ctx.stroke(body)
}

// Anodised satin metal: one broad reflection and restrained horizontal
// brushing, continuous across joints.
function metal(ctx: Ctx, bounds: Bounds, unit: number): void {
  ctx.fillStyle = linearGradient(
    ctx,
    bounds,
    [argb(0x22000000), argb(0x0a000000), argb(0x70ffffff), argb(0x38ffffff), argb(0x24000000), argb(0x10ffffff)],
    { begin: [-1, -0.5], end: [1, 0.5], stops: [0, 0.23, 0.43, 0.51, 0.68, 1] },
  )
  ctx.fillRect(bounds.left, bounds.top, bounds.right - bounds.left, bounds.bottom - bounds.top)
  // Subpixel brushing would alias in small thumbnails.
  if (unit < 24) return
  const light = new Path2D()
  const dark = new Path2D()
  const height = bounds.bottom - bounds.top
  for (let i = 0; i * unit * 0.035 < height; i += 1) {
    const y = bounds.top + i * unit * 0.035
    const path = i % 2 === 0 ? light : dark
    path.moveTo(bounds.left, y)
    path.lineTo(bounds.right, y)
  }
  ctx.lineWidth = unit * 0.009
  ctx.strokeStyle = css(argb(0x13ffffff))
  ctx.stroke(light)
  ctx.lineWidth = unit * 0.007
  ctx.strokeStyle = css(argb(0x0c000000))
  ctx.stroke(dark)
}

// One symmetric cut per grid square, centred exactly on it.
function crystal(ctx: Ctx, cell: Bounds, light: number): void {
  const cx = (cell.left + cell.right) / 2
  const cy = (cell.top + cell.bottom) / 2
  const corners: [number, number][] = [
    [cell.left, cell.top],
    [cell.right, cell.top],
    [cell.right, cell.bottom],
    [cell.left, cell.bottom],
  ]
  const shades = [
    withAlpha(white, 0.25 * light),
    withAlpha(black, 0.1 * light),
    withAlpha(black, 0.18 * light),
    withAlpha(white, 0.07 * light),
  ]
  for (let i = 0; i < 4; i += 1) {
    const [ax, ay] = corners[i]
    const [bx, by] = corners[(i + 1) % 4]
    const path = new Path2D()
    path.moveTo(cx, cy)
    path.lineTo(ax, ay)
    path.lineTo(bx, by)
    path.closePath()
    ctx.fillStyle = css(shades[i])
    ctx.fill(path)
  }
}

// Sandstone: broad mineral patches plus sharp pores and glints, in
// normalised coordinates so the grain is the same at every scale.
function stone(ctx: Ctx, bounds: Bounds, light: number): void {
  const width = bounds.right - bounds.left
  const height = bounds.bottom - bounds.top
  const unit = Math.min(width, height)
  const paths = stonePaths()
  ctx.save()
  ctx.translate(bounds.left, bounds.top)
  ctx.scale(width, height)
  paths.forEach((path, i) => {
    const mineral = i < 2
    const central = i >= 4
    const color = withAlpha(i % 2 === 0 ? white : argb(0xff624831), (mineral ? 0.12 : central ? 0.09 : 0.3) * light)
    blurred(ctx, mineral ? 0.045 : 0, color, (c) => c.fill(path))
  })
  ctx.restore()
  const d = unit * 0.035
  ctx.lineWidth = unit * 0.018
  ctx.strokeStyle = css(withAlpha(white, 0.25 * light))
  ctx.stroke(roundedRect({ left: bounds.left + d, top: bounds.top + d, right: bounds.right - d, bottom: bounds.bottom - d }, unit * 0.12))
}

let cachedStonePaths: Path2D[] | null = null

// The mobile app builds these once from `Random(7319)`; the Dart generator
// is reproduced bit for bit so the grain matches.
function stonePaths(): Path2D[] {
  if (cachedStonePaths) return cachedStonePaths
  const paths = Array.from({ length: 6 }, () => new Path2D())
  const random = new DartRandom(7319)
  const oval = (path: Path2D, cx: number, cy: number, rx: number, ry: number) => {
    path.moveTo(cx + rx, cy)
    path.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2)
  }
  for (let i = 0; i < 14; i += 1) {
    const cx = random.nextDouble()
    const cy = random.nextDouble()
    const radius = 0.06 + random.nextDouble() * 0.13
    oval(paths[i % 2], cx, cy, radius, radius)
  }
  for (let i = 0; i < 170; i += 1) {
    const px = random.nextDouble()
    const py = random.nextDouble()
    const central = Math.abs(px - 0.5) < 0.22 && Math.abs(py - 0.5) < 0.16
    const index = (central ? 4 : 2) + (i % 3 === 0 ? 0 : 1)
    const w = 0.008 + random.nextDouble() * 0.024
    const h = 0.006 + random.nextDouble() * 0.012
    oval(paths[index], px, py, w / 2, h / 2)
  }
  cachedStonePaths = paths
  return paths
}
