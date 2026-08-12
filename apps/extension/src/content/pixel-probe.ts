/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { PixelContrast, Rgb } from '@vantra-a11y/math'
import { judgePixelContrast, parseColor } from '@vantra-a11y/math'
import type { ElementRect } from '@vantra-a11y/protocol'

/**
 * Measures text contrast from the rendered page.
 *
 * axe declines to judge contrast whenever a pseudo element, gradient, image or
 * opacity group sits behind the text, and no amount of CSS walking can settle
 * those: a pseudo element's geometry is not exposed to script at all. The pixels
 * are, so we read them instead.
 *
 * The method is a difference of two captures. The first is the page as it is.
 * For the second, glyph fills are turned transparent, which leaves the surface
 * behind the text and nothing else. Where the two differ, a glyph was painted —
 * that is the mask; sampling the second capture at those exact positions yields
 * the surfaces the text actually sits on.
 *
 * `-webkit-text-fill-color` is what makes this safe. Setting `color` would also
 * change every `currentColor` on the page — borders, backgrounds, SVG fills — and
 * we would be measuring a page that never existed. `text-fill-color` touches
 * glyph painting alone.
 */

export interface ProbeTarget {
  selector: string
  rect: ElementRect
  /** Computed `color`, used as the text colour to weigh surfaces against. */
  foreground: string
}

export interface ProbeOptions {
  /**
   * Takes a PNG data URL of the visible viewport, or returns `null` when the
   * capture is unavailable. Injected because only extension pages may call
   * `chrome.tabs.captureVisibleTab` — and because tests can then supply real
   * screenshots without a panel.
   */
  capture: () => Promise<string | null>
  /**
   * Pause between captures. `captureVisibleTab` is rate limited by the browser,
   * and exceeding it fails the call outright rather than queueing.
   */
  captureIntervalMs?: number
  /** Reports how many viewport bands are done, for scan progress. */
  onProgress?: (done: number, total: number) => void
}

/** Channel distance above which a pixel counts as glyph rather than noise. */
const GLYPH_DIFF = 60

const OVERLAY_TAG = 'vantra-a11y-overlay'

const HIDE_TEXT_CSS = `* {
  -webkit-text-fill-color: transparent !important;
  text-shadow: none !important;
}`

/**
 * Suppresses motion so the two captures describe the same page.
 *
 * Deliberately `paused` rather than `none`. Removing an animation reverts the
 * element to its base style, and for the common fade-in-on-scroll pattern that
 * base style is `opacity: 0` — the text would vanish from both captures and the
 * finding would be reported as unmeasurable when it was merely hidden by us.
 * Pausing freezes what is currently on screen.
 */
const FREEZE_CSS = `*, *::before, *::after {
  animation-play-state: paused !important;
  transition: none !important;
  caret-color: transparent !important;
}`

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    window.setTimeout(resolve, ms)
  })

/** Waits for two frames, so style changes are actually painted before capturing. */
const painted = (): Promise<void> =>
  new Promise((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => resolve())
    })
  })

function addStyle(css: string): HTMLStyleElement {
  const style = document.createElement('style')
  style.textContent = css
  document.documentElement.appendChild(style)
  return style
}

/**
 * Turns a data URL into a blob by hand.
 *
 * `fetch` would read a `data:` URL without touching the network, but the
 * extension bans `fetch` outright (docs/ARCHITECTURE.md §6) and a ban with
 * exceptions is no ban. Decoding base64 ourselves keeps the guarantee literal.
 */
function dataUrlToBlob(dataUrl: string): Blob {
  const binary = atob(dataUrl.slice(dataUrl.indexOf(',') + 1))
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
  return new Blob([bytes], { type: 'image/png' })
}

async function decode(dataUrl: string): Promise<ImageData | null> {
  try {
    const bitmap = await createImageBitmap(dataUrlToBlob(dataUrl))
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height)
    const context = canvas.getContext('2d')
    if (!context) return null
    context.drawImage(bitmap, 0, 0)
    const data = context.getImageData(0, 0, bitmap.width, bitmap.height)
    bitmap.close()
    return data
  } catch {
    return null
  }
}

/**
 * Collects the surfaces behind one element's glyphs.
 *
 * Coordinates arrive in page space and the captures are viewport space, so the
 * scroll offset comes off first; `scale` then covers high-DPI displays, where the
 * image is a multiple of the CSS viewport.
 */
function sampleBackgrounds(
  rect: ElementRect,
  withText: ImageData,
  withoutText: ImageData,
  scrollX: number,
  scrollY: number,
  scale: number,
): Rgb[] {
  const left = Math.max(0, Math.floor((rect.x - scrollX) * scale))
  const top = Math.max(0, Math.floor((rect.y - scrollY) * scale))
  const right = Math.min(withText.width, Math.ceil((rect.x - scrollX + rect.w) * scale))
  const bottom = Math.min(withText.height, Math.ceil((rect.y - scrollY + rect.h) * scale))

  const samples: Rgb[] = []

  for (let y = top; y < bottom; y += 1) {
    for (let x = left; x < right; x += 1) {
      const i = (y * withText.width + x) * 4
      const diff =
        Math.abs(withText.data[i]! - withoutText.data[i]!) +
        Math.abs(withText.data[i + 1]! - withoutText.data[i + 1]!) +
        Math.abs(withText.data[i + 2]! - withoutText.data[i + 2]!)
      if (diff < GLYPH_DIFF) continue

      samples.push({
        r: withoutText.data[i]!,
        g: withoutText.data[i + 1]!,
        b: withoutText.data[i + 2]!,
        a: 1,
      })
    }
  }

  return samples
}

/** Groups targets by the viewport they fall into, so each band is captured once. */
function bandsOf(targets: readonly ProbeTarget[], viewportHeight: number): Map<number, ProbeTarget[]> {
  const bands = new Map<number, ProbeTarget[]>()
  for (const target of targets) {
    const band = Math.floor(target.rect.y / viewportHeight)
    const list = bands.get(band)
    if (list) list.push(target)
    else bands.set(band, [target])
  }
  return new Map([...bands.entries()].sort((a, b) => a[0] - b[0]))
}

/**
 * Measures every target it can and returns verdicts by selector.
 *
 * Targets it cannot settle — too few glyph pixels, a failed capture — are simply
 * absent from the result, so the caller keeps them undecided instead of
 * inheriting a number nobody measured.
 */
export async function probeContrast(
  targets: readonly ProbeTarget[],
  options: ProbeOptions,
): Promise<Map<string, PixelContrast>> {
  const verdicts = new Map<string, PixelContrast>()
  if (targets.length === 0) return verdicts

  const interval = options.captureIntervalMs ?? 550
  const viewportHeight = window.innerHeight
  const bands = bandsOf(targets, viewportHeight)

  // The user's scroll position is theirs; scanning must hand it back untouched.
  const originalX = window.scrollX
  const originalY = window.scrollY

  // Our own markers would be photographed as part of the page and read as the
  // background behind the text. The host is in a closed shadow root, so axe
  // cannot see it — a camera can.
  const overlay = document.querySelector<HTMLElement>(OVERLAY_TAG)
  const overlayDisplay = overlay?.style.display ?? null

  const freeze = addStyle(FREEZE_CSS)
  if (overlay) overlay.style.display = 'none'

  let done = 0

  /**
   * One retry, because the browser's capture rate limit rejects rather than
   * queues. Giving up on the first refusal would throw away every band still to
   * come; giving up on the second means the panel is gone and there is nothing to
   * wait for.
   */
  const capture = async (): Promise<string | null> => {
    const first = await options.capture()
    if (first) return first
    await sleep(interval)
    return options.capture()
  }

  try {
    for (const [band, bandTargets] of bands) {
      window.scrollTo(originalX, band * viewportHeight)
      await painted()

      const withTextUrl = await capture()
      if (!withTextUrl) break

      await sleep(interval)

      const hide = addStyle(HIDE_TEXT_CSS)
      await painted()
      const withoutTextUrl = await capture()
      hide.remove()

      if (!withoutTextUrl) break

      const [withText, withoutText] = await Promise.all([
        decode(withTextUrl),
        decode(withoutTextUrl),
      ])

      if (withText && withoutText && withText.width === withoutText.width) {
        const scale = withText.width / window.innerWidth
        for (const target of bandTargets) {
          const foreground = parseColor(target.foreground)
          if (!foreground) continue

          const backgrounds = sampleBackgrounds(
            target.rect,
            withText,
            withoutText,
            window.scrollX,
            window.scrollY,
            scale,
          )
          const verdict = judgePixelContrast(backgrounds, { ...foreground, a: 1 })
          if (verdict) verdicts.set(target.selector, verdict)
        }
      }

      done += 1
      options.onProgress?.(done, bands.size)

      if (done < bands.size) await sleep(interval)
    }
  } finally {
    freeze.remove()
    if (overlay) overlay.style.display = overlayDisplay ?? ''
    window.scrollTo(originalX, originalY)
  }

  return verdicts
}
