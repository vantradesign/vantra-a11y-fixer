/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

export type { FixContext, FixProvider, NormalizedIssue } from './types.js'

export type { AnalyseInput } from './engine.js'
export { analyse, DEFAULT_PROVIDERS } from './engine.js'

export type { RuleDescriptor } from './taxonomy.js'
export { describeRule, RULE_TAXONOMY } from './taxonomy.js'

export { hasUndecidedGuidance, undecidedGuidance } from './undecided.js'

export { accessibleNameFixProvider, nameCandidates } from './providers/accessible-name.js'
export { contrastFixProvider } from './providers/contrast.js'
export { labelAssociationFixProvider } from './providers/label-association.js'
export { roleHeuristicFixProvider } from './providers/role-heuristic.js'
export { targetSizeFixProvider } from './providers/target-size.js'
