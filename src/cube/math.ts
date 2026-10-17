/** Dart's `double.round()`: halves round away from zero (JavaScript's
 * `Math.round` rounds them up). */
export function dartRound(value: number): number {
  return value < 0 ? -Math.round(-value) : Math.round(value)
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

/** Flutter's curves, with the same control points as `Curves.*` there, so
 * the web moves exactly like the phone. */
export const Curves = {
  linear: (t: number) => t,
  easeOutCubic: (t: number) => cubicBezier(0.215, 0.61, 0.355, 1, t),
  easeInCubic: (t: number) => cubicBezier(0.55, 0.055, 0.675, 0.19, t),
  easeInOutCubic: (t: number) => cubicBezier(0.645, 0.045, 0.355, 1, t),
  easeInOutSine: (t: number) => cubicBezier(0.445, 0.05, 0.55, 0.95, t),
  easeInOut: (t: number) => cubicBezier(0.42, 0, 0.58, 1, t),
  easeOut: (t: number) => cubicBezier(0, 0, 0.58, 1, t),
  /** Overshoots a little before settling. */
  easeOutBack: (t: number) => cubicBezier(0.175, 0.885, 0.32, 1.275, t),
}

/** A CSS-style cubic Bézier timing curve (as Flutter's `Cubic`). */
function cubicBezier(a: number, b: number, c: number, d: number, t: number): number {
  if (t <= 0 || t >= 1) return t <= 0 ? 0 : 1
  const ev = (p1: number, p2: number, m: number) => 3 * p1 * (1 - m) * (1 - m) * m + 3 * p2 * (1 - m) * m * m + m * m * m
  let start = 0
  let end = 1
  for (;;) {
    const mid = (start + end) / 2
    const estimate = ev(a, c, mid)
    if (Math.abs(t - estimate) < 0.001) return ev(b, d, mid)
    if (estimate < t) start = mid
    else end = mid
  }
}
