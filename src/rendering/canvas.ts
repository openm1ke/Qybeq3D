import { css, type Rgba } from './color'
/** A rectangle by its edges. */
export interface Bounds {
  readonly left: number
  readonly top: number
  readonly right: number
  readonly bottom: number
}

/**
 * Small Canvas 2D equivalents of the Flutter painting primitives the mobile
 * renderers use (blur mask filters, alignment-based gradients, layers).
 */

type Ctx = CanvasRenderingContext2D

/** Device pixels per unit of the current transform. */
export function deviceScale(ctx: Ctx): number {
  const m = ctx.getTransform()
  return Math.hypot(m.a, m.b) || 1
}

/**
 * Runs [draw] so that everything it paints comes out Gaussian-blurred with
 * [sigma] (in current user units), like Flutter's
 * `MaskFilter.blur(BlurStyle.normal, sigma)`. Only the alpha of what [draw]
 * paints is used; the colour is [color].
 *
 * Implemented with an offset shadow, which every browser supports: the
 * shapes are painted far to the left and only their shadow lands in place.
 * Clips still apply to the shadow, as they do to a blurred Flutter paint.
 */
export function blurred(ctx: Ctx, sigma: number, color: Rgba, draw: (ctx: Ctx) => void): void {
  if (sigma <= 0.01) {
    ctx.save()
    ctx.fillStyle = css(color)
    ctx.strokeStyle = css(color)
    draw(ctx)
    ctx.restore()
    return
  }
  const scale = deviceScale(ctx)
  const offset = ctx.canvas.width + ctx.canvas.height + sigma * scale * 8 + 64
  ctx.save()
  const m = ctx.getTransform()
  ctx.setTransform(new DOMMatrix([1, 0, 0, 1, -offset, 0]).multiply(m))
  ctx.shadowColor = css(color)
  ctx.shadowBlur = 2 * sigma * scale
  ctx.shadowOffsetX = offset
  ctx.shadowOffsetY = 0
  ctx.fillStyle = '#000'
  ctx.strokeStyle = '#000'
  draw(ctx)
  ctx.restore()
}

/** Fills [path] with [color], blurred by [sigma] when positive. */
export function fillPath(ctx: Ctx, path: Path2D, color: Rgba, sigma = 0, rule: CanvasFillRule = 'nonzero'): void {
  blurred(ctx, sigma, color, (c) => c.fill(path, rule))
}

export function strokePath(ctx: Ctx, path: Path2D, color: Rgba, width: number, sigma = 0): void {
  blurred(ctx, sigma, color, (c) => {
    c.lineWidth = width
    c.stroke(path)
  })
}

/** Flutter `Alignment` inside [bounds]. */
export function align(bounds: Bounds, ax: number, ay: number): [number, number] {
  const cx = (bounds.left + bounds.right) / 2
  const cy = (bounds.top + bounds.bottom) / 2
  return [cx + (ax * (bounds.right - bounds.left)) / 2, cy + (ay * (bounds.bottom - bounds.top)) / 2]
}

/**
 * `LinearGradient(begin, end, colors, stops).createShader(bounds)`. Without
 * [begin]/[end] it runs left to right like Flutter's default.
 */
export function linearGradient(
  ctx: Ctx,
  bounds: Bounds,
  colors: readonly Rgba[],
  options: { begin?: [number, number]; end?: [number, number]; stops?: readonly number[] } = {},
): CanvasGradient {
  const [bx, by] = align(bounds, ...(options.begin ?? [-1, 0]))
  const [ex, ey] = align(bounds, ...(options.end ?? [1, 0]))
  const gradient = ctx.createLinearGradient(bx, by, ex, ey)
  addStops(gradient, colors, options.stops)
  return gradient
}

export const topCenter: [number, number] = [0, -1]
export const bottomCenter: [number, number] = [0, 1]

/** Vertical gradient from the top to the bottom of [bounds]. */
export function verticalGradient(ctx: Ctx, bounds: Bounds, colors: readonly Rgba[], stops?: readonly number[]): CanvasGradient {
  return linearGradient(ctx, bounds, colors, { begin: topCenter, end: bottomCenter, stops })
}

/** `RadialGradient(center, radius)`: radius is a fraction of the shortest side. */
export function radialGradient(
  ctx: Ctx,
  bounds: Bounds,
  center: [number, number],
  radius: number,
  colors: readonly Rgba[],
  stops?: readonly number[],
): CanvasGradient {
  const [cx, cy] = align(bounds, ...center)
  const shortest = Math.min(bounds.right - bounds.left, bounds.bottom - bounds.top)
  const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius * shortest)
  addStops(gradient, colors, stops)
  return gradient
}

function addStops(gradient: CanvasGradient, colors: readonly Rgba[], stops?: readonly number[]): void {
  colors.forEach((color, index) => {
    const offset = stops?.[index] ?? (colors.length === 1 ? 0 : index / (colors.length - 1))
    gradient.addColorStop(Math.min(1, Math.max(0, offset)), css(color))
  })
}

export function rectBounds(left: number, top: number, width: number, height: number): Bounds {
  return { left, top, right: left + width, bottom: top + height }
}

/** A rounded rect path (`RRect.fromRectAndRadius`). */
export function roundedRect(bounds: Bounds, radius: number): Path2D {
  const path = new Path2D()
  const w = bounds.right - bounds.left
  const h = bounds.bottom - bounds.top
  const r = Math.max(0, Math.min(radius, w / 2, h / 2))
  path.moveTo(bounds.left + r, bounds.top)
  path.arcTo(bounds.right, bounds.top, bounds.right, bounds.bottom, r)
  path.arcTo(bounds.right, bounds.bottom, bounds.left, bounds.bottom, r)
  path.arcTo(bounds.left, bounds.bottom, bounds.left, bounds.top, r)
  path.arcTo(bounds.left, bounds.top, bounds.right, bounds.top, r)
  path.closePath()
  return path
}

export function inflate(bounds: Bounds, delta: number): Bounds {
  return { left: bounds.left - delta, top: bounds.top - delta, right: bounds.right + delta, bottom: bounds.bottom + delta }
}

export function shift(bounds: Bounds, dx: number, dy: number): Bounds {
  return { left: bounds.left + dx, top: bounds.top + dy, right: bounds.right + dx, bottom: bounds.bottom + dy }
}

/**
 * A scratch canvas with the same bitmap size and transform as [ctx], for
 * shapes that need compositing (e.g. "body minus shifted body").
 */
export function scratchLike(ctx: Ctx): Ctx {
  const canvas = document.createElement('canvas')
  canvas.width = ctx.canvas.width
  canvas.height = ctx.canvas.height
  const scratch = canvas.getContext('2d')!
  scratch.setTransform(ctx.getTransform())
  return scratch
}

/**
 * Draws a scratch canvas made by [scratchLike] into [ctx] 1:1, optionally
 * blurred with [sigma] (user units) in [color].
 */
export function drawScratch(ctx: Ctx, scratch: Ctx, sigma = 0, color?: Rgba): void {
  const scale = deviceScale(ctx)
  ctx.save()
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  if (sigma > 0.01 && color) {
    const offset = ctx.canvas.width + ctx.canvas.height + sigma * scale * 8 + 64
    ctx.shadowColor = css(color)
    ctx.shadowBlur = 2 * sigma * scale
    ctx.shadowOffsetX = offset
    ctx.drawImage(scratch.canvas, -offset, 0)
  } else {
    ctx.drawImage(scratch.canvas, 0, 0)
  }
  ctx.restore()
}

/** Prepares [canvas] for drawing [width]×[height] logical px plus [overflow] on every side. */
export function prepareCanvas(
  canvas: HTMLCanvasElement,
  width: number,
  height: number,
  overflow: number,
  pixelRatio = typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1,
): Ctx | null {
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  const w = Math.max(1, Math.ceil((width + overflow * 2) * pixelRatio))
  const h = Math.max(1, Math.ceil((height + overflow * 2) * pixelRatio))
  if (canvas.width !== w) canvas.width = w
  if (canvas.height !== h) canvas.height = h
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.clearRect(0, 0, w, h)
  ctx.setTransform(pixelRatio, 0, 0, pixelRatio, overflow * pixelRatio, overflow * pixelRatio)
  return ctx
}
