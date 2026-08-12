/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

export type { Oklch, Rgb } from './color.js'
export {
  composite,
  contrastRatio,
  oklchToRgb,
  parseColor,
  relativeLuminance,
  rgbToOklch,
  toHex,
} from './color.js'

export type {
  AdjustTarget,
  ContrastSolution,
  TextContext,
  WcagLevel,
} from './contrast-target.js'
export {
  isLargeText,
  requiredRatio,
  solveContrast,
  solveContrastFromPalette,
} from './contrast-target.js'

export type { PixelContrast } from './pixel-contrast.js'
export { judgePixelContrast, MIN_PIXEL_SAMPLES } from './pixel-contrast.js'

export type { PaddingPx, TargetBox, TargetSizeSolution } from './target-size.js'
export {
  MIN_TARGET_AA_PX,
  MIN_TARGET_AAA_PX,
  requiredTargetSize,
  solveTargetSize,
} from './target-size.js'
