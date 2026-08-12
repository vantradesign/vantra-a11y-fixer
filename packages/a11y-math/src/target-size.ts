/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { WcagLevel } from './contrast-target.js'

/** SC 2.5.8 Target Size (Minimum), Level AA. */
export const MIN_TARGET_AA_PX = 24

/** SC 2.5.5 Target Size (Enhanced), Level AAA. */
export const MIN_TARGET_AAA_PX = 44

export interface PaddingPx {
  top: number
  right: number
  bottom: number
  left: number
}

/**
 * The layout facts needed to reason about a target's size. Measured by the
 * content script; `widthPx`/`heightPx` are border-box dimensions as reported by
 * `getBoundingClientRect`.
 */
export interface TargetBox {
  widthPx: number
  heightPx: number
  paddingPx: PaddingPx
  boxSizing: 'content-box' | 'border-box'
  /** Computed `display`, needed because `min-*` does not apply to inline boxes. */
  display: string
}

export interface TargetSizeSolution {
  requiredPx: number
  widthBeforePx: number
  heightBeforePx: number
  /** Whether the box already satisfies the requirement in both dimensions. */
  meetsAlready: boolean
  /** Rounded-up `min-width` / `min-height` that satisfy the requirement. */
  minWidthPx: number
  minHeightPx: number
  /** Extra padding per side that would grow the box to the requirement. */
  paddingDeltaPx: { inline: number; block: number }
  /** Resulting padding values, existing plus delta. */
  paddingAfterPx: PaddingPx
  /**
   * `min-width`/`min-height` have no effect on non-replaced inline boxes, so a
   * `display` change has to come with them.
   */
  needsDisplayChange: boolean
}

/**
 * There is no Level A target-size criterion. When an element was flagged we still
 * need a floor to compute against, so A falls back to the AA minimum rather than
 * reporting "no requirement" for something axe already considers a problem.
 */
export function requiredTargetSize(level: WcagLevel): number {
  return level === 'AAA' ? MIN_TARGET_AAA_PX : MIN_TARGET_AA_PX
}

/** Inline boxes ignore `min-width`/`min-height` unless they are replaced elements. */
const IGNORES_MIN_DIMENSIONS = new Set(['inline'])

/**
 * Computes the smallest changes that bring a target up to the required size.
 *
 * Pure geometry: no assumption about what the element is for. The caller decides
 * whether a size change is appropriate at all — WCAG 2.5.8 has exceptions
 * (inline links in a sentence, user-agent-controlled and essential targets) that
 * cannot be judged from measurements alone.
 */
export function solveTargetSize(box: TargetBox, requiredPx: number): TargetSizeSolution {
  const deficitWidth = Math.max(0, requiredPx - box.widthPx)
  const deficitHeight = Math.max(0, requiredPx - box.heightPx)

  return {
    requiredPx,
    widthBeforePx: box.widthPx,
    heightBeforePx: box.heightPx,
    meetsAlready: deficitWidth === 0 && deficitHeight === 0,
    minWidthPx: Math.max(requiredPx, Math.ceil(box.widthPx)),
    minHeightPx: Math.max(requiredPx, Math.ceil(box.heightPx)),
    // Split across both sides so the element grows symmetrically and its optical
    // centre does not move.
    paddingDeltaPx: {
      inline: Math.ceil(deficitWidth / 2),
      block: Math.ceil(deficitHeight / 2),
    },
    paddingAfterPx: {
      top: box.paddingPx.top + Math.ceil(deficitHeight / 2),
      right: box.paddingPx.right + Math.ceil(deficitWidth / 2),
      bottom: box.paddingPx.bottom + Math.ceil(deficitHeight / 2),
      left: box.paddingPx.left + Math.ceil(deficitWidth / 2),
    },
    needsDisplayChange: IGNORES_MIN_DIMENSIONS.has(box.display),
  }
}
