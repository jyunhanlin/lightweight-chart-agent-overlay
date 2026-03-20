// src/core/ui/chat-input.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ChatInput } from './chat-input'
import type { ModelOption, AnalysisPreset } from '../types'

const MODELS: readonly ModelOption[] = [
  { id: 'gpt-4o', label: 'GPT-4o' },
  { id: 'gpt-3.5', label: 'GPT-3.5' },
]

const PRESETS: readonly AnalysisPreset[] = [
  { label: 'Support/Resistance', systemPrompt: 'sys1', quickPrompt: 'default1' },
  { label: 'Trend', systemPrompt: 'sys2', quickPrompt: 'default2' },
]

describe('ChatInput', () => {
  let container: HTMLElement

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
  })

  afterEach(() => {
    container.remove()
  })

  // ── DOM structure ──────────────────────────────────────────────────────────

  it('renders textarea and toolbar into container', () => {
    const input = new ChatInput(container)
    expect(container.querySelector('textarea')).not.toBeNull()
    expect(container.querySelector('[data-chat-input-toolbar]')).not.toBeNull()
    input.destroy()
  })

  // ── ⌘↵ submit ─────────────────────────────────────────────────────────────

  it('⌘↵ fires onSubmit with textarea value', () => {
    const input = new ChatInput(container)
    const onSubmit = vi.fn()
    input.onSubmit = onSubmit

    const ta = container.querySelector('textarea') as HTMLTextAreaElement
    ta.value = 'Hello world'
    ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', metaKey: true, bubbles: true }))

    expect(onSubmit).toHaveBeenCalledWith('Hello world')
    input.destroy()
  })

  it('Ctrl+↵ fires onSubmit with textarea value', () => {
    const input = new ChatInput(container)
    const onSubmit = vi.fn()
    input.onSubmit = onSubmit

    const ta = container.querySelector('textarea') as HTMLTextAreaElement
    ta.value = 'Hello world'
    ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true }))

    expect(onSubmit).toHaveBeenCalledWith('Hello world')
    input.destroy()
  })

  it('⌘↵ does not fire onSubmit when textarea is empty', () => {
    const input = new ChatInput(container)
    const onSubmit = vi.fn()
    input.onSubmit = onSubmit

    const ta = container.querySelector('textarea') as HTMLTextAreaElement
    ta.value = '   '
    ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', metaKey: true, bubbles: true }))

    expect(onSubmit).not.toHaveBeenCalled()
    input.destroy()
  })

  // ── textarea clears after submit ───────────────────────────────────────────

  it('textarea clears after submit', () => {
    const input = new ChatInput(container)
    input.onSubmit = vi.fn()

    const ta = container.querySelector('textarea') as HTMLTextAreaElement
    ta.value = 'Some message'
    ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', metaKey: true, bubbles: true }))

    expect(ta.value).toBe('')
    input.destroy()
  })

  // ── setLoading ─────────────────────────────────────────────────────────────

  it('setLoading(true) disables textarea', () => {
    const input = new ChatInput(container)
    input.setLoading(true)

    const ta = container.querySelector('textarea') as HTMLTextAreaElement
    expect(ta.disabled).toBe(true)
    input.destroy()
  })

  it('setLoading(false) enables textarea', () => {
    const input = new ChatInput(container)
    input.setLoading(true)
    input.setLoading(false)

    const ta = container.querySelector('textarea') as HTMLTextAreaElement
    expect(ta.disabled).toBe(false)
    input.destroy()
  })

  // ── getSelectedModel ───────────────────────────────────────────────────────

  it('getSelectedModel returns first model by default', () => {
    const input = new ChatInput(container, { availableModels: MODELS })
    expect(input.getSelectedModel()).toBe('gpt-4o')
    input.destroy()
  })

  it('getSelectedModel returns undefined when no models provided', () => {
    const input = new ChatInput(container)
    expect(input.getSelectedModel()).toBeUndefined()
    input.destroy()
  })

  // ── focus ──────────────────────────────────────────────────────────────────

  it('focus() focuses the textarea', () => {
    const input = new ChatInput(container)
    const ta = container.querySelector('textarea') as HTMLTextAreaElement
    const focusSpy = vi.spyOn(ta, 'focus')
    input.focus()
    expect(focusSpy).toHaveBeenCalled()
    input.destroy()
  })

  // ── showError ──────────────────────────────────────────────────────────────

  it('showError displays error message', () => {
    const input = new ChatInput(container)
    input.showError('Something went wrong')

    const errorEl = container.querySelector('[data-chat-input-error]') as HTMLElement
    expect(errorEl).not.toBeNull()
    expect(errorEl.textContent).toContain('Something went wrong')
    expect(errorEl.style.display).not.toBe('none')
    input.destroy()
  })

  // ── destroy ────────────────────────────────────────────────────────────────

  it('destroy removes all DOM elements', () => {
    const input = new ChatInput(container)
    input.destroy()
    expect(container.children.length).toBe(0)
  })

  // ── openSettings ──────────────────────────────────────────────────────────

  it('openSettings() opens settings panel when requiresApiKey is true', () => {
    const input = new ChatInput(container, { requiresApiKey: true })
    input.openSettings()
    expect(container.querySelector('[data-agent-overlay-settings]')).not.toBeNull()
    input.destroy()
  })

  it('openSettings() with message shows message in settings panel', () => {
    const input = new ChatInput(container, { requiresApiKey: true })
    input.openSettings('Enter your API key')
    const msg = container.querySelector('[data-agent-overlay-settings-message]') as HTMLElement
    expect(msg.textContent).toContain('Enter your API key')
    input.destroy()
  })

  it('openSettings() is a no-op when requiresApiKey is false', () => {
    const input = new ChatInput(container)
    input.openSettings()
    expect(container.querySelector('[data-agent-overlay-settings]')).toBeNull()
    input.destroy()
  })

  // ── getSelectedPresets ─────────────────────────────────────────────────────

  it('getSelectedPresets returns empty array when no presets provided', () => {
    const input = new ChatInput(container)
    expect(input.getSelectedPresets()).toEqual([])
    input.destroy()
  })

  it('getSelectedPresets returns selected presets', () => {
    const input = new ChatInput(container, { presets: PRESETS })
    // First preset is pre-selected by default
    const selected = input.getSelectedPresets()
    expect(selected).toHaveLength(1)
    expect(selected[0]).toEqual(PRESETS[0])
    input.destroy()
  })

  // ── toolbar dropdowns ──────────────────────────────────────────────────────

  it('renders model dropdown when models are provided', () => {
    const input = new ChatInput(container, { availableModels: MODELS })
    expect(container.querySelector('[data-chat-input-model-dropdown]')).not.toBeNull()
    input.destroy()
  })

  it('does not render model dropdown when no models provided', () => {
    const input = new ChatInput(container)
    expect(container.querySelector('[data-chat-input-model-dropdown]')).toBeNull()
    input.destroy()
  })

  it('renders preset dropdown when presets are provided', () => {
    const input = new ChatInput(container, { presets: PRESETS })
    expect(container.querySelector('[data-chat-input-preset-dropdown]')).not.toBeNull()
    input.destroy()
  })

  it('renders settings gear when requiresApiKey is true', () => {
    const input = new ChatInput(container, { requiresApiKey: true })
    expect(container.querySelector('[data-agent-overlay-settings-trigger]')).not.toBeNull()
    input.destroy()
  })

  it('does not render settings gear when requiresApiKey is false', () => {
    const input = new ChatInput(container)
    expect(container.querySelector('[data-agent-overlay-settings-trigger]')).toBeNull()
    input.destroy()
  })
})
