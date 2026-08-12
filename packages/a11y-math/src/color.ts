/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

export interface Rgb {
  r: number
  g: number
  b: number
  a: number
}

export interface Oklch {
  l: number
  c: number
  h: number
  a: number
}

const HEX_SHORT = /^#([0-9a-f])([0-9a-f])([0-9a-f])([0-9a-f])?$/i
const HEX_LONG = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})?$/i
const RGB_FN = /^rgba?\(([^)]+)\)$/i
const OKLAB_FN = /^oklab\(([^)]+)\)$/i
const OKLCH_FN = /^oklch\(([^)]+)\)$/i

/** Percentage reference for OKLab chroma and the a/b axes, per CSS Color 4. */
const CHROMA_100_PCT = 0.4

const clamp = (value: number, min: number, max: number): number =>
  value < min ? min : value > max ? max : value

const components = (body: string): string[] =>
  body
    .split(/[,/\s]+/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0)

/**
 * One numeric component, resolving percentages against `percentBase`.
 *
 * `none` resolves to 0 rather than failing: CSS Color 4 allows it as a missing
 * component, and its used value in these conversions is zero.
 */
const component = (part: string, percentBase: number): number | null => {
  if (part === 'none') return 0
  const value = Number.parseFloat(part)
  if (Number.isNaN(value)) return null
  return part.endsWith('%') ? (value / 100) * percentBase : value
}

/**
 * Rounds channels to integers.
 *
 * The hex and `rgb()` branches yield integers, and callers compare and hash the
 * results; a notation that returned `254.99999999999997` for white would make
 * two identical colours look different depending on how they were written.
 */
const quantise = (color: Rgb): Rgb => ({
  r: clamp(Math.round(color.r), 0, 255),
  g: clamp(Math.round(color.g), 0, 255),
  b: clamp(Math.round(color.b), 0, 255),
  a: color.a,
})

/** A hue, in any of the angle units CSS permits. */
const angle = (part: string): number | null => {
  if (part === 'none') return 0
  const value = Number.parseFloat(part)
  if (Number.isNaN(value)) return null
  if (part.endsWith('turn')) return value * 360
  if (part.endsWith('grad')) return value * 0.9
  if (part.endsWith('rad')) return (value * 180) / Math.PI
  return value
}

/**
 * Parses the colour notations axe-core reports (`#rrggbb`, `#rgb`,
 * `rgb(r g b)`, `rgba(r, g, b, a)`) as well as `oklab()` and `oklch()`.
 *
 * The OKLab notations are not optional in practice. Browsers do not convert them
 * away: a colour declared in `oklch()` comes back from `getComputedStyle` as
 * `oklab(...)`, and Tailwind 4 ships its entire default palette in `oklch()`. A
 * parser without them silently treats a large share of modern pages as having no
 * readable colours at all, which surfaces as contrast findings that can never be
 * decided.
 *
 * Returns `null` for anything we cannot resolve with certainty — notably
 * `currentColor`, gradients and named colours we deliberately do not guess at,
 * because a wrong parse would produce a confidently wrong fix proposal.
 */
export function parseColor(input: string): Rgb | null {
  const value = input.trim().toLowerCase()

  const short = HEX_SHORT.exec(value)
  if (short) {
    const [, r, g, b, a] = short
    return {
      r: Number.parseInt(`${r}${r}`, 16),
      g: Number.parseInt(`${g}${g}`, 16),
      b: Number.parseInt(`${b}${b}`, 16),
      a: a === undefined ? 1 : Number.parseInt(`${a}${a}`, 16) / 255,
    }
  }

  const long = HEX_LONG.exec(value)
  if (long) {
    const [, r, g, b, a] = long
    return {
      r: Number.parseInt(r as string, 16),
      g: Number.parseInt(g as string, 16),
      b: Number.parseInt(b as string, 16),
      a: a === undefined ? 1 : Number.parseInt(a, 16) / 255,
    }
  }

  const fn = RGB_FN.exec(value)
  if (fn) {
    const parts = (fn[1] as string)
      .split(/[,/\s]+/)
      .map((part) => part.trim())
      .filter((part) => part.length > 0)
    if (parts.length < 3) return null
    const channels = parts.slice(0, 3).map((part) =>
      part.endsWith('%')
        ? (Number.parseFloat(part) / 100) * 255
        : Number.parseFloat(part),
    )
    if (channels.some((channel) => Number.isNaN(channel))) return null
    const alphaRaw = parts[3]
    const alpha =
      alphaRaw === undefined
        ? 1
        : alphaRaw.endsWith('%')
          ? Number.parseFloat(alphaRaw) / 100
          : Number.parseFloat(alphaRaw)
    if (Number.isNaN(alpha)) return null
    return {
      r: clamp(Math.round(channels[0] as number), 0, 255),
      g: clamp(Math.round(channels[1] as number), 0, 255),
      b: clamp(Math.round(channels[2] as number), 0, 255),
      a: clamp(alpha, 0, 1),
    }
  }

  const oklch = OKLCH_FN.exec(value)
  if (oklch) {
    const parts = components(oklch[1] as string)
    if (parts.length < 3) return null
    const l = component(parts[0] as string, 1)
    const c = component(parts[1] as string, CHROMA_100_PCT)
    const h = angle(parts[2] as string)
    const alpha = parts[3] === undefined ? 1 : component(parts[3], 1)
    if (l === null || c === null || h === null || alpha === null) return null
    return quantise(oklchToRgb({ l, c, h, a: clamp(alpha, 0, 1) }))
  }

  const oklab = OKLAB_FN.exec(value)
  if (oklab) {
    const parts = components(oklab[1] as string)
    if (parts.length < 3) return null
    const l = component(parts[0] as string, 1)
    const okA = component(parts[1] as string, CHROMA_100_PCT)
    const okB = component(parts[2] as string, CHROMA_100_PCT)
    const alpha = parts[3] === undefined ? 1 : component(parts[3], 1)
    if (l === null || okA === null || okB === null || alpha === null) return null
    return quantise(oklabToRgb(l, okA, okB, clamp(alpha, 0, 1)))
  }

  return null
}

export function toHex({ r, g, b }: Rgb): string {
  const hex = (channel: number): string =>
    clamp(Math.round(channel), 0, 255).toString(16).padStart(2, '0')
  return `#${hex(r)}${hex(g)}${hex(b)}`
}

/**
 * Flattens a semi-transparent foreground over an opaque backdrop. axe-core
 * already does this internally; we redo it so a proposal computed from the
 * reported colour pair stays consistent with what is actually rendered.
 */
export function composite(fg: Rgb, bg: Rgb): Rgb {
  if (fg.a >= 1) return { ...fg, a: 1 }
  const mix = (f: number, b: number): number => f * fg.a + b * (1 - fg.a)
  return { r: mix(fg.r, bg.r), g: mix(fg.g, bg.g), b: mix(fg.b, bg.b), a: 1 }
}

const srgbToLinear = (channel: number): number => {
  const c = channel / 255
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
}

const linearToSrgb = (channel: number): number => {
  const c = channel <= 0.0031308 ? channel * 12.92 : 1.055 * Math.pow(channel, 1 / 2.4) - 0.055
  return clamp(c * 255, 0, 255)
}

/** WCAG 2.x relative luminance (SC 1.4.3 / 1.4.6 definition). */
export function relativeLuminance(color: Rgb): number {
  return (
    0.2126 * srgbToLinear(color.r) +
    0.7152 * srgbToLinear(color.g) +
    0.0722 * srgbToLinear(color.b)
  )
}

/** WCAG 2.x contrast ratio, 1–21. Both colours must already be opaque. */
export function contrastRatio(a: Rgb, b: Rgb): number {
  const la = relativeLuminance(a)
  const lb = relativeLuminance(b)
  const lighter = Math.max(la, lb)
  const darker = Math.min(la, lb)
  return (lighter + 0.05) / (darker + 0.05)
}

export function rgbToOklch(color: Rgb): Oklch {
  const r = srgbToLinear(color.r)
  const g = srgbToLinear(color.g)
  const b = srgbToLinear(color.b)

  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)

  const okL = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s
  const okA = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s
  const okB = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s

  const chroma = Math.sqrt(okA * okA + okB * okB)
  const hue = chroma < 1e-7 ? 0 : ((Math.atan2(okB, okA) * 180) / Math.PI + 360) % 360

  return { l: okL, c: chroma, h: hue, a: color.a }
}

/** Shared by `oklchToRgb` and the `oklab()` parser, which differ only in intake. */
function oklabToRgb(okL: number, okA: number, okB: number, alpha: number): Rgb {
  const l = Math.pow(okL + 0.3963377774 * okA + 0.2158037573 * okB, 3)
  const m = Math.pow(okL - 0.1055613458 * okA - 0.0638541728 * okB, 3)
  const s = Math.pow(okL - 0.0894841775 * okA - 1.291485548 * okB, 3)

  return {
    r: linearToSrgb(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    g: linearToSrgb(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    b: linearToSrgb(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
    a: alpha,
  }
}

export function oklchToRgb(color: Oklch): Rgb {
  const hRad = (color.h * Math.PI) / 180
  return oklabToRgb(color.l, Math.cos(hRad) * color.c, Math.sin(hRad) * color.c, color.a)
}
