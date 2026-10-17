/** Screen points and rectangles (Flutter's `Offset` and `Rect`). */
export interface Pt {
  readonly x: number
  readonly y: number
}

export const pt = (x: number, y: number): Pt => ({ x, y })
export const add = (a: Pt, b: Pt): Pt => ({ x: a.x + b.x, y: a.y + b.y })
export const sub = (a: Pt, b: Pt): Pt => ({ x: a.x - b.x, y: a.y - b.y })
export const scale = (a: Pt, s: number): Pt => ({ x: a.x * s, y: a.y * s })
export const dist = (a: Pt): number => Math.hypot(a.x, a.y)
export const lerpPt = (a: Pt, b: Pt, t: number): Pt => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t })

export interface Rect {
  readonly left: number
  readonly top: number
  readonly right: number
  readonly bottom: number
}

export const rect = (left: number, top: number, width: number, height: number): Rect => ({ left, top, right: left + width, bottom: top + height })
export const rectWidth = (r: Rect) => r.right - r.left
export const rectHeight = (r: Rect) => r.bottom - r.top
export const rectCenter = (r: Rect): Pt => ({ x: (r.left + r.right) / 2, y: (r.top + r.bottom) / 2 })
export const rectContains = (r: Rect, p: Pt) => p.x >= r.left && p.x < r.right && p.y >= r.top && p.y < r.bottom
export const rectShift = (r: Rect, d: Pt): Rect => ({ left: r.left + d.x, top: r.top + d.y, right: r.right + d.x, bottom: r.bottom + d.y })
export const rectDeflate = (r: Rect, d: number): Rect => ({ left: r.left + d, top: r.top + d, right: r.right - d, bottom: r.bottom - d })
export const rectOverlaps = (a: Rect, b: Rect) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom
export const rectUnion = (a: Rect, b: Rect): Rect => ({
  left: Math.min(a.left, b.left),
  top: Math.min(a.top, b.top),
  right: Math.max(a.right, b.right),
  bottom: Math.max(a.bottom, b.bottom),
})
export const rectFromCenter = (c: Pt, width: number, height: number): Rect => ({
  left: c.x - width / 2,
  top: c.y - height / 2,
  right: c.x + width / 2,
  bottom: c.y + height / 2,
})
export const rectLerp = (a: Rect, b: Rect, t: number): Rect => ({
  left: a.left + (b.left - a.left) * t,
  top: a.top + (b.top - a.top) * t,
  right: a.right + (b.right - a.right) * t,
  bottom: a.bottom + (b.bottom - a.bottom) * t,
})
export const rectEquals = (a: Rect, b: Rect) => a.left === b.left && a.top === b.top && a.right === b.right && a.bottom === b.bottom

export function boundsOf(points: readonly Pt[]): Rect {
  let left = Infinity
  let top = Infinity
  let right = -Infinity
  let bottom = -Infinity
  for (const p of points) {
    left = Math.min(left, p.x)
    top = Math.min(top, p.y)
    right = Math.max(right, p.x)
    bottom = Math.max(bottom, p.y)
  }
  return { left, top, right, bottom }
}

/** Whether [p] is inside the polygon (even-odd, as Flutter's `Path.contains`). */
export function polygonContains(polygon: readonly Pt[], p: Pt): boolean {
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i]
    const b = polygon[j]
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside
  }
  return inside
}
