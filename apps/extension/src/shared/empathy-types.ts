/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Message types for the screenreader-empathy integration.
 *
 * Kept separate from `@vantra-a11y/protocol` to avoid adding a cross-package
 * dependency on `@vantra-design/screenreader-empathy` to the protocol package.
 * The protocol package stays zero-dep; these types are scoped to the extension.
 */

import type {
  TraversalEntry,
  TraversalResult,
  StructureReport,
} from '@vantra-design/screenreader-empathy/core'

// Re-export so panel code can import empathy types from one place.
export type { TraversalEntry, TraversalResult, StructureReport }

export type EmpathyPlaybackState = 'idle' | 'playing' | 'paused'

/** Panel → content script. */
export type EmpathyPanelMessage =
  | { type: 'EMPATHY_START' }
  | { type: 'EMPATHY_PLAY' }
  | { type: 'EMPATHY_PAUSE' }
  | { type: 'EMPATHY_STOP' }
  | { type: 'EMPATHY_SEEK'; index: number }
  | { type: 'EMPATHY_HIGHLIGHT'; selector: string }

/** Content script → panel. */
export type EmpathyPageMessage =
  | { type: 'EMPATHY_RESULT'; traversal: TraversalResult; structure: StructureReport }
  | { type: 'EMPATHY_PLAYBACK'; state: EmpathyPlaybackState; currentIndex: number }
  | { type: 'EMPATHY_ERROR'; detail: string }

export function isEmpathyPanelMessage(
  message: { type: string },
): message is EmpathyPanelMessage {
  return message.type.startsWith('EMPATHY_') && !message.type.startsWith('EMPATHY_RESULT') && !message.type.startsWith('EMPATHY_PLAYBACK') && !message.type.startsWith('EMPATHY_ERROR')
}

export function isEmpathyPageMessage(
  message: { type: string },
): message is EmpathyPageMessage {
  return (
    message.type === 'EMPATHY_RESULT' ||
    message.type === 'EMPATHY_PLAYBACK' ||
    message.type === 'EMPATHY_ERROR'
  )
}
