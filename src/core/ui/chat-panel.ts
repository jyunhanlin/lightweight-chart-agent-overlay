// src/core/ui/chat-panel.ts
import type { ChatTurn, AnalysisPreset, ModelOption } from '../types'
import { clampToViewport, type UIPosition } from './calculate-position'
import { makeDraggable } from './make-draggable'
import { makeResizable } from './make-resizable'
import { ChatInput } from './chat-input'
import { ChatMessageList } from './chat-message-list'

const DEFAULT_WIDTH = 420
const DEFAULT_HEIGHT = 500

function injectScrollbarStyles(): void {
  const id = 'ao-scrollbar-style'
  if (document.getElementById(id)) return
  const style = document.createElement('style')
  style.id = id
  style.textContent = `
    [data-agent-overlay-message-list] {
      scrollbar-width: thin;
      scrollbar-color: transparent transparent;
      transition: scrollbar-color 0.3s;
    }
    [data-agent-overlay-message-list]:hover {
      scrollbar-color: rgba(255,255,255,0.3) transparent;
    }
    [data-agent-overlay-message-list]::-webkit-scrollbar {
      width: 6px;
    }
    [data-agent-overlay-message-list]::-webkit-scrollbar-track {
      background: transparent;
    }
    [data-agent-overlay-message-list]::-webkit-scrollbar-thumb {
      background: transparent;
      border-radius: 3px;
    }
    [data-agent-overlay-message-list]:hover::-webkit-scrollbar-thumb {
      background: rgba(255,255,255,0.3);
    }
    [data-agent-overlay-chat] textarea {
      scrollbar-width: thin;
      scrollbar-color: transparent transparent;
    }
    [data-agent-overlay-chat] textarea:focus {
      scrollbar-color: rgba(255,255,255,0.3) transparent;
    }
    [data-agent-overlay-chat] textarea::-webkit-scrollbar {
      width: 4px;
    }
    [data-agent-overlay-chat] textarea::-webkit-scrollbar-track {
      background: transparent;
    }
    [data-agent-overlay-chat] textarea::-webkit-scrollbar-thumb {
      background: transparent; border-radius: 2px;
    }
    [data-agent-overlay-chat] textarea:focus::-webkit-scrollbar-thumb {
      background: rgba(255,255,255,0.2);
    }
  `
  document.head.appendChild(style)
}

export interface ChatPanelOptions {
  readonly availableModels?: readonly ModelOption[]
  readonly presets?: readonly AnalysisPreset[]
  readonly requiresApiKey?: boolean
  readonly apiKeyStorageKey?: string
}

export interface ChatPanelShowOptions {
  readonly position?: UIPosition
  readonly currentIndex: number
  readonly totalCount: number
}

function buildNavBar(
  currentIndex: number,
  totalCount: number,
  onPrev: () => void,
  onNext: () => void,
  onClose: () => void,
  onToggleCollapse: () => void,
): HTMLElement {
  const nav = document.createElement('div')
  nav.setAttribute('data-agent-overlay-nav', '')
  nav.style.cssText = `
    display: flex; align-items: center; justify-content: space-between;
    padding: 4px 8px; border-bottom: 1px solid var(--ao-divider); gap: 4px;
  `

  const navLeft = document.createElement('div')
  const hideNav = totalCount <= 1
  navLeft.style.cssText = `display: flex; align-items: center; gap: 4px;${hideNav ? ' visibility: hidden;' : ''}`

  const prevBtn = document.createElement('button')
  prevBtn.setAttribute('data-agent-overlay-nav-prev', '')
  prevBtn.textContent = '\u2190'
  prevBtn.disabled = currentIndex === 0
  prevBtn.style.cssText = `
    background: none; border: none; cursor: ${currentIndex === 0 ? 'default' : 'pointer'};
    color: ${currentIndex === 0 ? 'var(--ao-close)' : 'var(--ao-text)'}; font-size: 14px; padding: 0 4px;
  `
  prevBtn.addEventListener('click', onPrev)

  const counter = document.createElement('span')
  counter.style.cssText = 'color: var(--ao-text); font-size: 12px;'
  counter.textContent = `${currentIndex + 1} / ${totalCount}`

  const nextBtn = document.createElement('button')
  nextBtn.setAttribute('data-agent-overlay-nav-next', '')
  nextBtn.textContent = '\u2192'
  nextBtn.disabled = currentIndex >= totalCount - 1
  nextBtn.style.cssText = `
    background: none; border: none; cursor: ${currentIndex >= totalCount - 1 ? 'default' : 'pointer'};
    color: ${currentIndex >= totalCount - 1 ? 'var(--ao-close)' : 'var(--ao-text)'}; font-size: 14px; padding: 0 4px;
  `
  nextBtn.addEventListener('click', onNext)

  navLeft.appendChild(prevBtn)
  navLeft.appendChild(counter)
  navLeft.appendChild(nextBtn)

  const btnStyle = `
    background: none; border: none; color: var(--ao-close); cursor: pointer;
    font-size: 13px; line-height: 1; padding: 2px 4px; width: 22px; height: 22px;
    display: flex; align-items: center; justify-content: center;
  `

  const navRight = document.createElement('div')
  navRight.style.cssText = 'display: flex; align-items: center; gap: 0; margin-left: auto;'

  const collapseBtn = document.createElement('button')
  collapseBtn.setAttribute('data-agent-overlay-collapse', '')
  collapseBtn.textContent = '\u2013' // –
  collapseBtn.style.cssText = btnStyle
  collapseBtn.addEventListener('click', onToggleCollapse)
  navRight.appendChild(collapseBtn)

  const closeBtn = document.createElement('button')
  closeBtn.setAttribute('data-agent-overlay-close', '')
  closeBtn.textContent = '\u00d7'
  closeBtn.style.cssText = btnStyle
  closeBtn.addEventListener('click', onClose)
  navRight.appendChild(closeBtn)

  nav.appendChild(navLeft)
  nav.appendChild(navRight)

  return nav
}

export class ChatPanel {
  // ── Public callbacks ───────────────────────────────────────────────────────
  onClose: (() => void) | null = null
  onAbort: (() => void) | null = null
  onNavigate: ((direction: -1 | 1) => void) | null = null
  onSubmit: ((text: string) => void) | null = null
  onTurnClick: ((index: number) => void) | null = null

  // ── Streaming state ────────────────────────────────────────────────────────
  isStreaming = false

  // ── Private state ──────────────────────────────────────────────────────────
  private readonly container: HTMLElement
  private readonly options: ChatPanelOptions

  private wrapper: HTMLElement | null = null
  private messageListContainer: HTMLElement | null = null
  private chatInputContainer: HTMLElement | null = null
  private messageList: ChatMessageList | null = null
  private chatInput: ChatInput | null = null
  private collapsed = false

  private cleanupDrag: (() => void) | null = null
  private cleanupResize: (() => void) | null = null

  private readonly handleEscape: (e: KeyboardEvent) => void

  constructor(container: HTMLElement, options?: ChatPanelOptions) {
    this.container = container
    this.options = options ?? {}

    this.handleEscape = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (this.isStreaming) {
        this.onAbort?.()
      } else {
        this.hide()
      }
    }
  }

  // ── show / hide / destroy ─────────────────────────────────────────────────

  show(options: ChatPanelShowOptions): void {
    // Replace without triggering onClose (same as ExplanationPopup pattern for re-show)
    this.removeWrapperDirectly()
    this.buildAndAttach(options)
  }

  hide(): void {
    this.removeWrapperDirectly()
    this.onClose?.()
  }

  destroy(): void {
    this.onClose = null
    this.onAbort = null
    this.onNavigate = null
    this.onSubmit = null
    this.onTurnClick = null
    this.removeWrapperDirectly()
  }

  isVisible(): boolean {
    return this.wrapper !== null
  }

  // ── ChatMessageList delegates ─────────────────────────────────────────────

  addTurn(turn: ChatTurn): void {
    this.messageList?.addTurn(turn)
  }

  startStreaming(userMessage: string, model?: string, presets?: readonly AnalysisPreset[]): void {
    this.isStreaming = true
    this.messageList?.startStreaming(userMessage, model, presets)
  }

  setStreamText(text: string): void {
    this.messageList?.setStreamText(text)
  }

  finalizeTurn(turn: ChatTurn): void {
    this.isStreaming = false
    this.messageList?.finalizeTurn(turn)
  }

  showError(message: string): void {
    this.messageList?.showError(message)
  }

  setActiveTurn(index: number): void {
    this.messageList?.setActiveTurn(index)
  }

  // ── ChatInput delegates ───────────────────────────────────────────────────

  getSelectedModel(): string | undefined {
    return this.chatInput?.getSelectedModel()
  }

  getSelectedPresets(): readonly AnalysisPreset[] {
    return this.chatInput?.getSelectedPresets() ?? []
  }

  setLoading(loading: boolean): void {
    this.chatInput?.setLoading(loading)
  }

  openSettings(message?: string): void {
    this.chatInput?.openSettings(message)
  }

  focusInput(): void {
    this.chatInput?.focus()
  }

  updateNav(currentIndex: number, totalCount: number): void {
    if (!this.wrapper) return
    const navLeft = this.wrapper.querySelector(
      '[data-agent-overlay-nav] > div:first-child',
    ) as HTMLElement | null
    if (!navLeft) return

    navLeft.style.visibility = totalCount <= 1 ? 'hidden' : ''

    const prevBtn = navLeft.querySelector(
      '[data-agent-overlay-nav-prev]',
    ) as HTMLButtonElement | null
    const counter = navLeft.querySelector('span')
    const nextBtn = navLeft.querySelector(
      '[data-agent-overlay-nav-next]',
    ) as HTMLButtonElement | null

    if (counter) counter.textContent = `${currentIndex + 1} / ${totalCount}`
    if (prevBtn) {
      prevBtn.disabled = currentIndex === 0
      prevBtn.style.cursor = currentIndex === 0 ? 'default' : 'pointer'
      prevBtn.style.color = currentIndex === 0 ? 'var(--ao-close)' : 'var(--ao-text)'
    }
    if (nextBtn) {
      nextBtn.disabled = currentIndex >= totalCount - 1
      nextBtn.style.cursor = currentIndex >= totalCount - 1 ? 'default' : 'pointer'
      nextBtn.style.color = currentIndex >= totalCount - 1 ? 'var(--ao-close)' : 'var(--ao-text)'
    }
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private removeWrapperDirectly(): void {
    this.cleanupDrag?.()
    this.cleanupDrag = null
    this.cleanupResize?.()
    this.cleanupResize = null

    this.messageList?.destroy()
    this.messageList = null
    this.chatInput?.destroy()
    this.chatInput = null
    this.messageListContainer = null
    this.chatInputContainer = null

    if (this.wrapper) {
      this.wrapper.remove()
      this.wrapper = null
      document.removeEventListener('keydown', this.handleEscape)
    }

    this.collapsed = false
    this.isStreaming = false
  }

  private toggleCollapse(): void {
    if (!this.wrapper || !this.messageListContainer || !this.chatInputContainer) return
    this.collapsed = !this.collapsed

    this.messageListContainer.style.display = this.collapsed ? 'none' : ''
    this.chatInputContainer.style.display = this.collapsed ? 'none' : ''

    const btn = this.wrapper.querySelector('[data-agent-overlay-collapse]')
    if (btn) btn.textContent = this.collapsed ? '\u25fb' : '\u2013' // ◻ or –

    // Shrink/restore wrapper height so it collapses to just the header
    if (this.collapsed) {
      this.wrapper.style.height = 'auto'
    } else {
      this.wrapper.style.height = `${DEFAULT_HEIGHT}px`
    }
  }

  private buildAndAttach(options: ChatPanelShowOptions): void {
    const { position, currentIndex, totalCount } = options

    // ── Wrapper ──────────────────────────────────────────────────────────────
    const wrapper = document.createElement('div')
    wrapper.setAttribute('data-agent-overlay-chat', '')
    wrapper.style.cssText = `
      position: absolute; z-index: 1000;
      background: var(--ao-bg); border: 1px solid var(--ao-border); border-radius: 6px;
      width: ${DEFAULT_WIDTH}px; height: ${DEFAULT_HEIGHT}px;
      display: flex; flex-direction: column;
      box-shadow: 0 2px 8px rgba(0,0,0,0.3);
      color: var(--ao-text); font-size: 13px;
    `

    // Apply position
    if (position) {
      wrapper.style.left = `${position.left}px`
      wrapper.style.top = `${position.top}px`
    }

    // ── Sticky header ────────────────────────────────────────────────────────
    const stickyHeader = document.createElement('div')
    stickyHeader.style.cssText = `
      position: sticky; top: 0; z-index: 1; background: var(--ao-bg);
      border-radius: 6px 6px 0 0; flex-shrink: 0; cursor: grab;
    `

    const handleClose = () => {
      if (this.isStreaming) {
        this.onAbort?.()
      } else {
        this.hide()
      }
    }
    const handlePrev = () => this.onNavigate?.(-1)
    const handleNext = () => this.onNavigate?.(1)
    const handleCollapse = () => this.toggleCollapse()

    stickyHeader.appendChild(
      buildNavBar(currentIndex, totalCount, handlePrev, handleNext, handleClose, handleCollapse),
    )
    wrapper.appendChild(stickyHeader)

    // ── Message list container ───────────────────────────────────────────────
    injectScrollbarStyles()
    const msgListContainer = document.createElement('div')
    msgListContainer.setAttribute('data-agent-overlay-message-list', '')
    msgListContainer.style.cssText = `
      flex: 1; overflow-y: auto;
    `
    wrapper.appendChild(msgListContainer)
    this.messageListContainer = msgListContainer

    // ── Chat input container ─────────────────────────────────────────────────
    const chatInputContainer = document.createElement('div')
    chatInputContainer.setAttribute('data-agent-overlay-chat-input', '')
    chatInputContainer.style.cssText = `
      border-top: 1px solid var(--ao-border); flex-shrink: 0;
    `
    wrapper.appendChild(chatInputContainer)
    this.chatInputContainer = chatInputContainer

    // ── Wire up sub-components ───────────────────────────────────────────────
    const msgList = new ChatMessageList(msgListContainer)
    msgList.onTurnClick = (index) => this.onTurnClick?.(index)
    this.messageList = msgList

    const chatInput = new ChatInput(chatInputContainer, {
      availableModels: this.options.availableModels,
      presets: this.options.presets,
      requiresApiKey: this.options.requiresApiKey,
      apiKeyStorageKey: this.options.apiKeyStorageKey,
    })
    chatInput.onSubmit = (text) => this.onSubmit?.(text)
    this.chatInput = chatInput

    // Stop mousedown propagation (so chart selection doesn't interfere)
    // But also close dropdowns when clicking non-dropdown areas within the panel
    wrapper.addEventListener('mousedown', (e) => {
      e.stopPropagation()
      this.chatInput?.closeDropdowns()
    })

    this.container.appendChild(wrapper)
    this.wrapper = wrapper
    document.addEventListener('keydown', this.handleEscape)

    // Clamp + drag from header + resizable
    clampToViewport(wrapper)
    this.cleanupDrag = makeDraggable(wrapper, { handle: stickyHeader, exclude: 'button' })
    this.cleanupResize = makeResizable(wrapper)
  }
}
