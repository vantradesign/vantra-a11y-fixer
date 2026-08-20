/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Screenreader-empathy integration for the content script.
 *
 * Runs `analyzeAccessibilityFlow(document)` on the live DOM, sends results to
 * the panel, and manages TTS playback via the Web Speech API.
 *
 * Uses Web Speech API (not Kokoro TTS) because:
 * - The extension CSP has `connect-src 'none'` — no model downloads.
 * - `speechSynthesis` is built into every modern browser, runs locally,
 *   and needs zero setup. Consistent with the zero-network guarantee.
 */

import {
  analyzeAccessibilityFlow,
  getStructureReport,
} from '@vantra-design/screenreader-empathy/core'
import type { TraversalResult, StructureReport } from '@vantra-design/screenreader-empathy/core'
import type { EmpathyPageMessage, EmpathyPlaybackState } from '../shared/empathy-types.js'
import { formatEntryForSpeech } from '../shared/empathy-speech.js'

// ── State ──

let lastResult: TraversalResult | null = null
let lastReport: StructureReport | null = null
let playbackState: EmpathyPlaybackState = 'idle'
let currentIndex = 0
let aborted = false
let cleanupHighlight: (() => void) | null = null
let speechRate = 1.0
let speechPitch = 1.0

// ── Highlighting ──

const HIGHLIGHT_CLASS = 'vantra-empathy-hl'
let stylesInjected = false

function injectHighlightStyles(): void {
  if (stylesInjected) return
  const style = document.createElement('style')
  style.textContent = `
    .${HIGHLIGHT_CLASS} {
      outline: 3px solid #50e8f4 !important;
      outline-offset: 2px !important;
      background-color: color-mix(in srgb, #50e8f4 10%, transparent) !important;
      transition: outline-color 0.15s ease, background-color 0.15s ease;
    }
    @media (prefers-reduced-motion: reduce) {
      .${HIGHLIGHT_CLASS} { transition: none; }
    }
  `
  document.head.appendChild(style)
  stylesInjected = true
}

function highlight(selector: string): () => void {
  injectHighlightStyles()
  const el = document.querySelector(selector)
  if (!el) return () => {}
  el.classList.add(HIGHLIGHT_CLASS)
  el.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  return () => el.classList.remove(HIGHLIGHT_CLASS)
}

function clearHighlights(): void {
  document.querySelectorAll(`.${HIGHLIGHT_CLASS}`).forEach(el =>
    el.classList.remove(HIGHLIGHT_CLASS),
  )
}

// ── Messaging ──

const send = (message: EmpathyPageMessage): void => {
  void chrome.runtime.sendMessage(message).catch(() => undefined)
}

function sendPlaybackState(): void {
  send({ type: 'EMPATHY_PLAYBACK', state: playbackState, currentIndex })
}

// ── Web Speech API TTS ──

function speak(text: string): Promise<void> {
  return new Promise<void>((resolve) => {
    if (!('speechSynthesis' in window)) {
      resolve()
      return
    }
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.rate = speechRate
    utterance.pitch = speechPitch
    // Use the page's lang for voice selection
    utterance.lang = document.documentElement.lang || 'en'
    utterance.onend = () => resolve()
    utterance.onerror = () => resolve()
    speechSynthesis.speak(utterance)
  })
}

/** Update speech settings from the panel. */
export function updateEmpathySettings(rate: number, pitch: number): void {
  speechRate = Math.max(0.5, Math.min(2.0, rate))
  speechPitch = Math.max(0.0, Math.min(2.0, pitch))
}

// ── Analysis ──

export function runEmpathy(): void {
  try {
    lastResult = analyzeAccessibilityFlow(document)
    lastReport = getStructureReport(lastResult)
    send({ type: 'EMPATHY_RESULT', traversal: lastResult, structure: lastReport })
  } catch (err) {
    send({
      type: 'EMPATHY_ERROR',
      detail: err instanceof Error ? err.message : String(err),
    })
  }
}

// ── Playback ──

export async function playEmpathy(): Promise<void> {
  if (!lastResult) return

  if (playbackState === 'paused') {
    speechSynthesis.resume()
    playbackState = 'playing'
    sendPlaybackState()
    return
  }

  playbackState = 'playing'
  aborted = false
  sendPlaybackState()

  for (let i = currentIndex; i < lastResult.entries.length; i++) {
    if (aborted || playbackState !== 'playing') break

    const entry = lastResult.entries[i]!
    currentIndex = i
    sendPlaybackState()

    // Highlight current element
    cleanupHighlight?.()
    cleanupHighlight = highlight(entry.selector)

    // Speak
    const text = formatEntryForSpeech(entry)
    if (text) {
      await speak(text)
    } else if (entry.role === 'image' && !entry.accessibleName) {
      // Decorative image — brief silence
      await new Promise(r => setTimeout(r, 300))
    }
  }

  if (!aborted) {
    playbackState = 'idle'
    currentIndex = 0
    cleanupHighlight?.()
    cleanupHighlight = null
    clearHighlights()
    sendPlaybackState()
  }
}

export function pauseEmpathy(): void {
  if (playbackState !== 'playing') return
  speechSynthesis.pause()
  playbackState = 'paused'
  sendPlaybackState()
}

export function stopEmpathy(): void {
  aborted = true
  speechSynthesis.cancel()
  playbackState = 'idle'
  currentIndex = 0
  cleanupHighlight?.()
  cleanupHighlight = null
  clearHighlights()
  sendPlaybackState()
}

export function seekEmpathy(index: number): void {
  if (!lastResult || index < 0 || index >= lastResult.entries.length) return
  currentIndex = index
  sendPlaybackState()
}

export function highlightEntry(selector: string): void {
  cleanupHighlight?.()
  cleanupHighlight = highlight(selector)
}

/** Clean up on page unload. */
export function destroyEmpathy(): void {
  stopEmpathy()
  lastResult = null
  lastReport = null
}
