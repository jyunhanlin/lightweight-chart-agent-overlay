// src/core/ui/dropdown.ts

type Theme = 'light' | 'dark'

interface DropdownItem {
  readonly id: string
  readonly label: string
}

interface DropdownOptions {
  readonly items: readonly DropdownItem[]
  readonly theme?: Theme
  readonly multiSelect?: boolean
  readonly showRun?: boolean
  readonly placeholder?: string
  readonly onSelect?: (selected: readonly DropdownItem[]) => void
  readonly onRun?: (selected: readonly DropdownItem[]) => void
  readonly manager?: { closeAllExcept(keep: Dropdown): void }
}

const THEME_COLORS: Record<
  Theme,
  {
    bg: string
    border: string
    text: string
    hoverBg: string
    selectedText: string
    selectedBg: string
    selectedBorder: string
    dimText: string
    btnBg: string
    runColor: string
    runBg: string
    disabledText: string
  }
> = {
  dark: {
    bg: '#252535',
    border: '#444',
    text: '#e0e0e0',
    hoverBg: '#2a3a5a',
    selectedText: '#4ade80',
    selectedBg: '#1a3a2a',
    selectedBorder: '#2a4a3a',
    dimText: '#666',
    btnBg: '#2a2a3a',
    runColor: '#2196f3',
    runBg: '#1a2a4a',
    disabledText: '#555',
  },
  light: {
    bg: '#f5f5f5',
    border: '#ccc',
    text: '#1a1a1a',
    hoverBg: '#e8eef8',
    selectedText: '#16a34a',
    selectedBg: '#f0fdf4',
    selectedBorder: '#bbf7d0',
    dimText: '#aaa',
    btnBg: '#efefef',
    runColor: '#1976d2',
    runBg: '#e3f2fd',
    disabledText: '#bbb',
  },
}

function buildButtonLabel(
  selected: readonly DropdownItem[],
  placeholder: string,
  multiSelect: boolean,
): string {
  if (!multiSelect) {
    return selected.length > 0 ? selected[0].label : placeholder
  }
  if (selected.length === 0) return placeholder
  if (selected.length === 1) return selected[0].label
  if (selected.length === 2) return `${selected[0].label}, ${selected[1].label}`
  return `${selected[0].label}, ${selected[1].label} +${selected.length - 2}`
}

export class Dropdown {
  readonly element: HTMLElement

  private readonly options: DropdownOptions
  private readonly theme: Theme
  private readonly placeholder: string
  private selectedIds: ReadonlySet<string>
  private isOpen: boolean
  private panel: HTMLElement | null
  private readonly handleOutsideClick: (e: MouseEvent) => void
  private readonly handleEscape: (e: KeyboardEvent) => void

  constructor(options: DropdownOptions) {
    this.options = options
    this.theme = options.theme ?? 'dark'
    this.placeholder = options.placeholder ?? '\u2014'
    this.selectedIds = new Set()
    this.isOpen = false
    this.panel = null

    this.handleOutsideClick = (e: MouseEvent) => {
      if (!this.isOpen) return
      const target = e.target as Node
      if (!this.element.contains(target) && !(this.panel?.contains(target) ?? false)) {
        this.close()
      }
    }

    this.handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && this.isOpen) {
        this.close()
      }
    }

    this.element = this.buildButton()
    document.addEventListener('mousedown', this.handleOutsideClick)
    document.addEventListener('keydown', this.handleEscape)
  }

  private buildButton(): HTMLElement {
    const s = THEME_COLORS[this.theme]
    const btn = document.createElement('button')
    btn.setAttribute('data-dropdown-trigger', '')
    btn.style.cssText = `
      background: ${s.btnBg}; border: 1px solid ${s.border}; color: ${s.text};
      border-radius: 4px; padding: 4px 10px; font-size: 13px; cursor: pointer;
      font-family: inherit; white-space: nowrap;
    `
    btn.textContent = buildButtonLabel([], this.placeholder, this.options.multiSelect ?? false)

    btn.addEventListener('mousedown', (e) => e.stopPropagation())
    btn.addEventListener('click', () => this.toggle())

    return btn
  }

  private buildPanel(): HTMLElement {
    const s = THEME_COLORS[this.theme]
    const panel = document.createElement('div')
    panel.setAttribute('data-dropdown-panel', '')
    panel.style.cssText = `
      position: absolute; z-index: 1001;
      background: ${s.bg}; border: 1px solid ${s.border};
      border-radius: 6px; min-width: 160px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.4);
      overflow: hidden; margin-top: 4px;
    `
    panel.addEventListener('mousedown', (e) => e.stopPropagation())

    for (const item of this.options.items) {
      panel.appendChild(this.buildItem(item, s))
    }

    if (this.options.multiSelect && this.options.showRun) {
      panel.appendChild(this.buildRunButton(s))
    }

    return panel
  }

  private buildItem(item: DropdownItem, s: (typeof THEME_COLORS)[Theme]): HTMLElement {
    const row = document.createElement('div')
    row.setAttribute('data-dropdown-item', item.id)
    const isSelected = this.selectedIds.has(item.id)

    row.style.cssText = `
      display: flex; align-items: center; gap: 8px;
      padding: 8px 12px; cursor: pointer; font-size: 13px;
      color: ${isSelected ? s.selectedText : s.text};
      background: ${isSelected ? s.selectedBg : 'transparent'};
    `

    if (this.options.multiSelect) {
      const checkbox = document.createElement('div')
      checkbox.setAttribute('data-dropdown-checkbox', item.id)
      checkbox.style.cssText = `
        width: 14px; height: 14px; border: 1px solid ${isSelected ? s.selectedText : s.dimText};
        border-radius: 3px; display: flex; align-items: center; justify-content: center;
        background: ${isSelected ? s.selectedBg : 'transparent'}; flex-shrink: 0;
      `
      if (isSelected) {
        checkbox.textContent = '\u2713'
        checkbox.style.color = s.selectedText
        checkbox.style.fontSize = '11px'
      }
      row.appendChild(checkbox)
    }

    const label = document.createElement('span')
    label.textContent = item.label
    row.appendChild(label)

    row.addEventListener('mouseover', () => {
      if (!this.selectedIds.has(item.id)) {
        row.style.background = s.hoverBg
      }
    })
    row.addEventListener('mouseout', () => {
      row.style.background = this.selectedIds.has(item.id) ? s.selectedBg : 'transparent'
    })

    row.addEventListener('click', () => this.handleItemClick(item))

    return row
  }

  private buildRunButton(s: (typeof THEME_COLORS)[Theme]): HTMLElement {
    const hasSelection = this.selectedIds.size > 0
    const btn = document.createElement('button')
    btn.setAttribute('data-dropdown-run', '')
    btn.textContent = 'Run'
    btn.disabled = !hasSelection
    btn.style.cssText = `
      width: 100%; padding: 8px 12px; border: none; border-top: 1px solid ${s.border};
      background: ${hasSelection ? s.runBg : 'transparent'};
      color: ${hasSelection ? s.runColor : s.disabledText};
      cursor: ${hasSelection ? 'pointer' : 'default'};
      font-size: 13px; font-family: inherit; text-align: left;
    `

    btn.addEventListener('click', () => {
      if (this.selectedIds.size === 0) return
      const selected = this.getSelected()
      this.options.onRun?.(selected)
      this.close()
    })

    return btn
  }

  private handleItemClick(item: DropdownItem): void {
    if (this.options.multiSelect) {
      const next = new Set(this.selectedIds)
      if (next.has(item.id)) {
        next.delete(item.id)
      } else {
        next.add(item.id)
      }
      this.selectedIds = next
      this.updateButtonLabel()
      this.refreshPanel()
      this.options.onSelect?.(this.getSelected())
    } else {
      this.selectedIds = new Set([item.id])
      this.updateButtonLabel()
      this.options.onSelect?.(this.getSelected())
      this.close()
    }
  }

  private updateButtonLabel(): void {
    this.element.textContent = buildButtonLabel(
      this.getSelected(),
      this.placeholder,
      this.options.multiSelect ?? false,
    )
  }

  private refreshPanel(): void {
    if (!this.panel) return
    const s = THEME_COLORS[this.theme]
    // Rebuild item rows (simpler than patching individual elements)
    const runBtn = this.panel.querySelector('[data-dropdown-run]')
    // Remove all item rows
    const items = Array.from(this.panel.querySelectorAll('[data-dropdown-item]'))
    for (const item of items) {
      item.remove()
    }
    // Re-insert items before run button
    for (const item of this.options.items) {
      const row = this.buildItem(item, s)
      if (runBtn) {
        this.panel.insertBefore(row, runBtn)
      } else {
        this.panel.appendChild(row)
      }
    }
    // Refresh run button state if present
    if (runBtn instanceof HTMLButtonElement) {
      const hasSelection = this.selectedIds.size > 0
      runBtn.disabled = !hasSelection
      runBtn.style.background = hasSelection ? s.runBg : 'transparent'
      runBtn.style.color = hasSelection ? s.runColor : s.disabledText
      runBtn.style.cursor = hasSelection ? 'pointer' : 'default'
    }
  }

  close(): void {
    if (!this.isOpen) return
    this.isOpen = false
    this.panel?.remove()
    this.panel = null
  }

  private open(): void {
    if (this.isOpen) return
    this.options.manager?.closeAllExcept(this)
    this.isOpen = true
    this.panel = this.buildPanel()

    // Position panel below the button
    const btnRect = this.element.getBoundingClientRect()
    const parentRect = this.element.offsetParent?.getBoundingClientRect()
    const offsetTop = parentRect ? btnRect.bottom - parentRect.top : btnRect.bottom
    const offsetLeft = parentRect ? btnRect.left - parentRect.left : btnRect.left

    this.panel.style.top = `${offsetTop}px`
    this.panel.style.left = `${offsetLeft}px`

    const parent = this.element.offsetParent ?? this.element.parentElement ?? document.body
    parent.appendChild(this.panel)
  }

  private toggle(): void {
    if (this.isOpen) {
      this.close()
    } else {
      this.open()
    }
  }

  getSelected(): readonly DropdownItem[] {
    return this.options.items.filter((item) => this.selectedIds.has(item.id))
  }

  setSelected(ids: readonly string[]): void {
    this.selectedIds = new Set(ids)
    this.updateButtonLabel()
    if (this.isOpen) {
      this.refreshPanel()
    }
  }

  destroy(): void {
    this.close()
    document.removeEventListener('mousedown', this.handleOutsideClick)
    document.removeEventListener('keydown', this.handleEscape)
  }
}
