// src/core/ui/theme.ts

export type Theme = 'light' | 'dark'

export interface ThemeColors {
  readonly base: {
    readonly bg: string
    readonly border: string
    readonly text: string
    readonly hint: string
    readonly divider: string
  }
  readonly prompt: {
    readonly toolbar: string
    readonly progressBar: string
  }
  readonly popup: {
    readonly closeColor: string
    readonly tagBg: string
    readonly bubbleBg: string
    readonly bubbleText: string
    readonly quickBg: string
    readonly quickBorder: string
    readonly quickText: string
  }
  readonly dropdown: {
    readonly bg: string
    readonly btnBg: string
    readonly hoverBg: string
    readonly selectedText: string
    readonly selectedBg: string
    readonly selectedBorder: string
    readonly dimText: string
    readonly runColor: string
    readonly runBg: string
    readonly disabledText: string
  }
  readonly chat: {
    readonly activeTurn: string
  }
  readonly history: {
    readonly bg: string
    readonly text: string
    readonly badgeBg: string
    readonly badgeText: string
  }
}

export const THEMES: Record<Theme, ThemeColors> = {
  dark: {
    base: {
      bg: '#1e1e2e',
      border: '#444',
      text: '#e0e0e0',
      hint: '#555',
      divider: '#333',
    },
    prompt: {
      toolbar: '#181828',
      progressBar: '#2196f3',
    },
    popup: {
      closeColor: '#888',
      tagBg: '#2a2a3e',
      bubbleBg: '#2a3a5a',
      bubbleText: '#8bb8e8',
      quickBg: '#1a1a2a',
      quickBorder: '#333',
      quickText: '#aaa',
    },
    dropdown: {
      bg: '#252535',
      btnBg: '#2a2a3a',
      hoverBg: '#2a3a5a',
      selectedText: '#4ade80',
      selectedBg: '#1a3a2a',
      selectedBorder: '#2a4a3a',
      dimText: '#666',
      runColor: '#2196f3',
      runBg: '#1a2a4a',
      disabledText: '#555',
    },
    chat: {
      activeTurn: '#f59e0b',
    },
    history: {
      bg: '#2a2a3a',
      text: '#888',
      badgeBg: '#333',
      badgeText: '#555',
    },
  },
  light: {
    base: {
      bg: '#ffffff',
      border: '#ccc',
      text: '#1a1a1a',
      hint: '#aaa',
      divider: '#e0e0e0',
    },
    prompt: {
      toolbar: '#f5f5f5',
      progressBar: '#1976d2',
    },
    popup: {
      closeColor: '#666',
      tagBg: '#f0f0f0',
      bubbleBg: '#e3f2fd',
      bubbleText: '#1565c0',
      quickBg: '#f5f5f5',
      quickBorder: '#ddd',
      quickText: '#666',
    },
    dropdown: {
      bg: '#f5f5f5',
      btnBg: '#efefef',
      hoverBg: '#e8eef8',
      selectedText: '#16a34a',
      selectedBg: '#f0fdf4',
      selectedBorder: '#bbf7d0',
      dimText: '#aaa',
      runColor: '#1976d2',
      runBg: '#e3f2fd',
      disabledText: '#bbb',
    },
    chat: {
      activeTurn: '#d97706',
    },
    history: {
      bg: '#f0f0f0',
      text: '#666',
      badgeBg: '#ddd',
      badgeText: '#999',
    },
  },
}

/** Set all theme CSS custom properties on an element */
export function applyThemeVars(el: HTMLElement, theme: Theme): void {
  const t = THEMES[theme]

  // Base
  el.style.setProperty('--ao-bg', t.base.bg)
  el.style.setProperty('--ao-border', t.base.border)
  el.style.setProperty('--ao-text', t.base.text)
  el.style.setProperty('--ao-hint', t.base.hint)
  el.style.setProperty('--ao-divider', t.base.divider)

  // Prompt
  el.style.setProperty('--ao-toolbar', t.prompt.toolbar)
  el.style.setProperty('--ao-progress', t.prompt.progressBar)

  // Popup
  el.style.setProperty('--ao-close', t.popup.closeColor)
  el.style.setProperty('--ao-tag-bg', t.popup.tagBg)
  el.style.setProperty('--ao-bubble-bg', t.popup.bubbleBg)
  el.style.setProperty('--ao-bubble-text', t.popup.bubbleText)
  el.style.setProperty('--ao-quick-bg', t.popup.quickBg)
  el.style.setProperty('--ao-quick-border', t.popup.quickBorder)
  el.style.setProperty('--ao-quick-text', t.popup.quickText)

  // Dropdown
  el.style.setProperty('--dd-bg', t.dropdown.bg)
  el.style.setProperty('--dd-btn-bg', t.dropdown.btnBg)
  el.style.setProperty('--dd-border', t.base.border)
  el.style.setProperty('--dd-text', t.base.text)
  el.style.setProperty('--dd-hover-bg', t.dropdown.hoverBg)
  el.style.setProperty('--dd-selected-text', t.dropdown.selectedText)
  el.style.setProperty('--dd-selected-bg', t.dropdown.selectedBg)
  el.style.setProperty('--dd-selected-border', t.dropdown.selectedBorder)
  el.style.setProperty('--dd-dim-text', t.dropdown.dimText)
  el.style.setProperty('--dd-run-color', t.dropdown.runColor)
  el.style.setProperty('--dd-run-bg', t.dropdown.runBg)
  el.style.setProperty('--dd-disabled-text', t.dropdown.disabledText)

  // Chat
  el.style.setProperty('--ao-active-turn', t.chat.activeTurn)

  // History
  el.style.setProperty('--ao-history-bg', t.history.bg)
  el.style.setProperty('--ao-history-text', t.history.text)
  el.style.setProperty('--ao-badge-bg', t.history.badgeBg)
  el.style.setProperty('--ao-badge-text', t.history.badgeText)
}
