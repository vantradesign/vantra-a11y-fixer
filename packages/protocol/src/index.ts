/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

export type {
  Category,
  Confidence,
  ElementRect,
  FixProposal,
  IssueCluster,
  IssueOccurrence,
  LocalizedText,
  ScanResult,
  Severity,
  WcagLevel,
  WcagReference,
} from './issue.js'
export { compareSeverity, DIFF_ABSENT, DIFF_REMOVED, SEVERITY_ORDER } from './issue.js'

export type { AxeTag, Settings } from './settings.js'
export { axeTagsFor, DEFAULT_SETTINGS } from './settings.js'

export type { Message, PageMessage, PanelMessage, ScanErrorReason } from './messages.js'
export { isPanelMessage, PORT_NAME } from './messages.js'
