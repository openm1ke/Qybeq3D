/**
 * Colours as the Flutter app models them: four floats (0..1), unpremultiplied.
 * The helpers mirror Flutter's `Color.lerp`, `withValues(alpha:)` and
 * `HSLColor`, including its 8-bit rounding, so every derived shade (slabs,
 * neon cores, highlights) matches the mobile app exactly.
 */
export interface Rgba {
  readonly a: number
  readonly r: number
  readonly g: number
  readonly b: number
}

/** `Color(0xAARRGGBB)`. */
export function argb(value: number): Rgba {
  return {
    a: ((value >>> 24) & 0xff) / 255,
    r: ((value >>> 16) & 0xff) / 255,
    g: ((value >>> 8) & 0xff) / 255,
    b: (value & 0xff) / 255,
  }
}

/** `Color.from(alpha:, red:, green:, blue:)`. */
export function rgba(r: number, g: number, b: number, a = 1): Rgba {
  return { a, r, g, b }
}

export const white: Rgba = argb(0xffffffff)
export const black: Rgba = argb(0xff000000)

export function withAlpha(color: Rgba, alpha: number): Rgba {
  return { ...color, a: clamp01(alpha) }
}

export function lerpColor(from: Rgba, to: Rgba, t: number): Rgba {
  const mix = (a: number, b: number) => clamp01(a + (b - a) * t)
  return { a: mix(from.a, to.a), r: mix(from.r, to.r), g: mix(from.g, to.g), b: mix(from.b, to.b) }
}

export function css(color: Rgba): string {
  const channel = (value: number) => Math.round(clamp01(value) * 255)
  return `rgba(${channel(color.r)},${channel(color.g)},${channel(color.b)},${+clamp01(color.a).toFixed(4)})`
}

export interface Hsl {
  readonly alpha: number
  readonly hue: number
  readonly saturation: number
  readonly lightness: number
}

export function toHsl(color: Rgba): Hsl {
  const { r, g, b } = color
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const delta = max - min
  let hue: number
  if (max === 0) hue = 0
  else if (max === r) hue = 60 * dartMod((g - b) / delta, 6)
  else if (max === g) hue = 60 * ((b - r) / delta + 2)
  else hue = 60 * ((r - g) / delta + 4)
  if (Number.isNaN(hue)) hue = 0
  const lightness = (max + min) / 2
  const saturation = min === max ? 0 : clamp01(delta / (1 - Math.abs(2 * lightness - 1)))
  return { alpha: color.a, hue, saturation, lightness }
}

export function fromHsl(hsl: Hsl): Rgba {
  const { alpha, hue, saturation, lightness } = hsl
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation
  const secondary = chroma * (1 - Math.abs(dartMod(hue / 60, 2) - 1))
  const match = lightness - chroma / 2
  let red: number
  let green: number
  let blue: number
  if (hue < 60) [red, green, blue] = [chroma, secondary, 0]
  else if (hue < 120) [red, green, blue] = [secondary, chroma, 0]
  else if (hue < 180) [red, green, blue] = [0, chroma, secondary]
  else if (hue < 240) [red, green, blue] = [0, secondary, chroma]
  else if (hue < 300) [red, green, blue] = [secondary, 0, chroma]
  else [red, green, blue] = [chroma, 0, secondary]
  // `Color.fromARGB` rounds every channel to 8 bits.
  const byte = (value: number) => Math.round(value * 255) / 255
  return { a: byte(alpha), r: byte(red + match), g: byte(green + match), b: byte(blue + match) }
}

/** Flutter's `ColorShade.shade`: moves HSL lightness by [amount]. */
export function shade(color: Rgba, amount: number): Rgba {
  const hsl = toHsl(color)
  return fromHsl({ ...hsl, lightness: clamp01(hsl.lightness + amount) })
}

/** `HSLColor.fromColor(color).withLightness(lightness).toColor()`. */
export function withLightness(color: Rgba, lightness: number): Rgba {
  return fromHsl({ ...toHsl(color), lightness })
}

function dartMod(value: number, divisor: number): number {
  const result = value % divisor
  return result < 0 ? result + divisor : result
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value))
}
