/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { Category, IssueCluster, Settings } from '@vantra-a11y/protocol'

import { CATEGORY_KEY, t, tt } from '../shared/i18n.js'
import { resolveSelector } from './selector.js'

const HOST_TAG = 'vantra-a11y-overlay'

const CATEGORY_COLOR: Record<Category, string> = {
  contrast: '#d81f3f',
  semantics: '#c98a00',
  structure: '#021f94',
  interaction: '#7a2fd8',
  manual: '#5c6a70',
}

/** Icon glyph per category, so colour is never the only carrier of meaning (SC 1.4.1). */
const CATEGORY_GLYPH: Record<Category, string> = {
  contrast: '◐',
  semantics: 'A',
  structure: '▤',
  interaction: '⌖',
  manual: '?',
}

interface Marker {
  element: Element
  category: Category
  title: string
  box: HTMLElement
}

/**
 * Draws issue markers over the page.
 *
 * Lives in a closed shadow root so page CSS cannot restyle it and the page's own
 * selectors cannot accidentally match it — the overlay must not become part of
 * what the next scan measures.
 */
export class Overlay {
  private host: HTMLElement | null = null
  private layer: HTMLElement | null = null
  private markers: Marker[] = []
  private frame = 0
  private observer: ResizeObserver | null = null
  private settings: Settings | null = null

  mount(settings: Settings): void {
    this.settings = settings
    if (this.host) return

    const host = document.createElement(HOST_TAG)
    host.setAttribute('aria-hidden', 'false')
    // The page's own stacking contexts are unknowable, so we sit at the top of
    // the layer order and take no space.
    host.style.cssText = 'all: initial; position: static;'

    const root = host.attachShadow({ mode: 'closed' })
    const style = document.createElement('style')
    style.textContent = `
      .layer {
        position: fixed;
        inset: 0;
        z-index: 2147483646;
        pointer-events: none;
        font: 12px/1.3 system-ui, sans-serif;
      }
      .marker {
        position: absolute;
        box-sizing: border-box;
        border-radius: 2px;
        pointer-events: none;
      }
      .badge {
        position: absolute;
        top: -18px;
        left: -1px;
        display: inline-flex;
        align-items: center;
        gap: 4px;
        min-height: 16px;
        padding: 1px 5px;
        border-radius: 2px 2px 0 0;
        color: #fff;
        white-space: nowrap;
        pointer-events: auto;
        cursor: default;
      }
      .badge:focus-visible {
        outline: 2px solid #f5f2f3;
        outline-offset: 1px;
      }
      .tooltip {
        position: absolute;
        top: 100%;
        left: 0;
        margin-top: 2px;
        max-width: 280px;
        padding: 6px 8px;
        border-radius: 3px;
        background: #001619;
        color: #f5f2f3;
        white-space: normal;
        display: none;
      }
      .badge:hover .tooltip,
      .badge:focus-visible .tooltip { display: block; }
      @media (prefers-reduced-motion: no-preference) {
        .marker { transition: opacity 120ms ease; }
      }
    `

    const layer = document.createElement('div')
    layer.className = 'layer'

    root.append(style, layer)
    document.documentElement.append(host)

    this.host = host
    this.layer = layer

    window.addEventListener('scroll', this.schedule, { passive: true, capture: true })
    window.addEventListener('resize', this.schedule, { passive: true })
    this.observer = new ResizeObserver(this.schedule)
    this.observer.observe(document.documentElement)
  }

  render(clusters: IssueCluster[], settings: Settings): void {
    this.settings = settings
    this.mount(settings)
    if (!this.layer) return

    this.layer.textContent = ''
    this.markers = []

    if (!settings.overlay.enabled) return

    for (const cluster of clusters) {
      for (const occurrence of cluster.occurrences) {
        const element = resolveSelector(occurrence.selector)
        if (!element) continue

        const box = document.createElement('div')
        box.className = 'marker'

        const badge = document.createElement('span')
        badge.className = 'badge'
        badge.tabIndex = -1
        badge.style.background = CATEGORY_COLOR[cluster.category]
        badge.textContent = `${CATEGORY_GLYPH[cluster.category]} ${t(CATEGORY_KEY[cluster.category])}`

        const title = tt(cluster.title)
        const tooltip = document.createElement('span')
        tooltip.className = 'tooltip'
        tooltip.textContent = t('overlayTooltip', [title])
        badge.append(tooltip)

        box.append(badge)
        this.layer.append(box)
        this.markers.push({ element, category: cluster.category, title, box })
      }
    }

    this.reposition()
  }

  /** Scrolls an element into view and pulses its marker. */
  highlight(selector: string): void {
    const element = resolveSelector(selector)
    if (!element) return

    element.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'smooth' })
    this.schedule()

    const marker = this.markers.find((candidate) => candidate.element === element)
    if (!marker) return
    marker.box.style.outline = '3px solid #50e8f4'
    marker.box.style.outlineOffset = '4px'
    window.setTimeout(() => {
      marker.box.style.outline = ''
      marker.box.style.outlineOffset = ''
    }, 1600)
  }

  clear(): void {
    if (this.layer) this.layer.textContent = ''
    this.markers = []
  }

  destroy(): void {
    window.removeEventListener('scroll', this.schedule, true)
    window.removeEventListener('resize', this.schedule)
    this.observer?.disconnect()
    this.observer = null
    this.host?.remove()
    this.host = null
    this.layer = null
    this.markers = []
  }

  private schedule = (): void => {
    if (this.frame !== 0) return
    this.frame = window.requestAnimationFrame(() => {
      this.frame = 0
      this.reposition()
    })
  }

  private reposition(): void {
    const width = this.settings?.overlay.outlineWidthPx ?? 2
    const viewportHeight = window.innerHeight
    const viewportWidth = window.innerWidth

    for (const marker of this.markers) {
      const box = marker.element.getBoundingClientRect()
      // Cheap viewport culling: off-screen markers stay in the DOM but hidden,
      // so scrolling a long page does not rebuild the layer.
      const visible =
        box.bottom > -40 && box.top < viewportHeight + 40 && box.right > 0 && box.left < viewportWidth
      marker.box.style.display = visible ? 'block' : 'none'
      if (!visible) continue

      marker.box.style.left = `${box.left - width}px`
      marker.box.style.top = `${box.top - width}px`
      marker.box.style.width = `${box.width + width * 2}px`
      marker.box.style.height = `${box.height + width * 2}px`
      marker.box.style.border = `${width}px solid ${CATEGORY_COLOR[marker.category]}`
    }
  }
}
