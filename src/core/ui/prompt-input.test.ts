// src/core/ui/prompt-input.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { PromptInput } from './prompt-input'
import type { ModelOption, AnalysisPreset } from '../types'

const MODELS: readonly ModelOption[] = [
  { id: 'gpt-4o', label: 'GPT-4o' },
  { id: 'gpt-3.5', label: 'GPT-3.5' },
]

const PRESETS: readonly AnalysisPreset[] = [
  { label: 'Support/Resistance', systemPrompt: 'sys1', quickPrompt: 'default1' },
  { label: 'Trend', systemPrompt: 'sys2', quickPrompt: 'default2' },
]

describe('PromptInput', () => {
  let container: HTMLElement

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
  })

  afterEach(() => {
    container.remove()
  })

  // ── DOM structure ──────────────────────────────────────────────────────────

  it('renders a textarea (not input)', () => {
    const prompt = new PromptInput(container)
    prompt.show()
    expect(container.querySelector('textarea')).not.toBeNull()
    expect(container.querySelector('input[type="text"]')).toBeNull()
    prompt.destroy()
  })

  it('show() adds wrapper with data-agent-overlay-prompt', () => {
    const prompt = new PromptInput(container)
    prompt.show()
    expect(container.querySelector('[data-agent-overlay-prompt]')).not.toBeNull()
    prompt.destroy()
  })

  // ── Keyboard interactions ──────────────────────────────────────────────────

  it('Enter submits when text is present', () => {
    const prompt = new PromptInput(container)
    const onSubmit = vi.fn()
    prompt.onSubmit = onSubmit
    prompt.show()

    const ta = container.querySelector('textarea') as HTMLTextAreaElement
    ta.value = 'Draw support lines'
    ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', metaKey: true, bubbles: true }))

    expect(onSubmit).toHaveBeenCalledWith('Draw support lines')
    prompt.destroy()
  })

  it('Enter does not submit when textarea is empty', () => {
    const prompt = new PromptInput(container)
    const onSubmit = vi.fn()
    prompt.onSubmit = onSubmit
    prompt.show()

    const ta = container.querySelector('textarea') as HTMLTextAreaElement
    ta.value = '   '
    ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))

    expect(onSubmit).not.toHaveBeenCalled()
    prompt.destroy()
  })

  it('Shift+Enter inserts newline and does not submit', () => {
    const prompt = new PromptInput(container)
    const onSubmit = vi.fn()
    prompt.onSubmit = onSubmit
    prompt.show()

    const ta = container.querySelector('textarea') as HTMLTextAreaElement
    ta.value = 'hello'
    const shiftEnter = new KeyboardEvent('keydown', { key: 'Enter', shiftKey: true, bubbles: true })
    ta.dispatchEvent(shiftEnter)

    expect(onSubmit).not.toHaveBeenCalled()
    prompt.destroy()
  })

  it('Escape calls onCancel', () => {
    const prompt = new PromptInput(container)
    const onCancel = vi.fn()
    prompt.onCancel = onCancel
    prompt.show()

    const ta = container.querySelector('textarea') as HTMLTextAreaElement
    ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))

    expect(onCancel).toHaveBeenCalled()
    prompt.destroy()
  })

  it('Escape hides the widget', () => {
    const prompt = new PromptInput(container)
    prompt.show()

    const ta = container.querySelector('textarea') as HTMLTextAreaElement
    ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))

    expect(container.querySelector('[data-agent-overlay-prompt]')).toBeNull()
    prompt.destroy()
  })

  // ── x button ──────────────────────────────────────────────────────────────

  it('x button calls onCancel', () => {
    const prompt = new PromptInput(container)
    const onCancel = vi.fn()
    prompt.onCancel = onCancel
    prompt.show()

    const closeBtn = container.querySelector('[data-agent-overlay-close]') as HTMLButtonElement
    expect(closeBtn).not.toBeNull()
    closeBtn.click()

    expect(onCancel).toHaveBeenCalled()
    prompt.destroy()
  })

  it('x button hides the widget', () => {
    const prompt = new PromptInput(container)
    prompt.show()

    const closeBtn = container.querySelector('[data-agent-overlay-close]') as HTMLButtonElement
    closeBtn.click()

    expect(container.querySelector('[data-agent-overlay-prompt]')).toBeNull()
    prompt.destroy()
  })

  // ── Model dropdown ─────────────────────────────────────────────────────────

  it('shows model dropdown when models are provided', () => {
    const prompt = new PromptInput(container, { availableModels: MODELS })
    prompt.show()

    // Model dropdown trigger button should be present
    const triggers = container.querySelectorAll('[data-dropdown-trigger]')
    expect(triggers.length).toBeGreaterThanOrEqual(1)
    prompt.destroy()
  })

  it('hides model dropdown when no models provided', () => {
    const prompt = new PromptInput(container, { presets: PRESETS })
    prompt.show()

    // Count triggers — only preset dropdown trigger expected
    // There should not be a model-specific wrapper visible
    const modelWrapper = container.querySelector('[data-agent-overlay-model-dropdown]')
    expect(modelWrapper).toBeNull()
    prompt.destroy()
  })

  // ── Preset dropdown ────────────────────────────────────────────────────────

  it('shows preset dropdown when presets are provided', () => {
    const prompt = new PromptInput(container, { presets: PRESETS })
    prompt.show()

    const triggers = container.querySelectorAll('[data-dropdown-trigger]')
    expect(triggers.length).toBeGreaterThanOrEqual(1)
    prompt.destroy()
  })

  it('hides preset dropdown when no presets provided', () => {
    const prompt = new PromptInput(container, { availableModels: MODELS })
    prompt.show()

    const presetWrapper = container.querySelector('[data-agent-overlay-preset-dropdown]')
    expect(presetWrapper).toBeNull()
    prompt.destroy()
  })

  it('shows only submit button when no models and no presets', () => {
    const prompt = new PromptInput(container)
    prompt.show()

    const triggers = container.querySelectorAll('[data-dropdown-trigger]')
    expect(triggers.length).toBe(0)

    const submitBtn = container.querySelector('[data-agent-overlay-submit]')
    expect(submitBtn).not.toBeNull()
    prompt.destroy()
  })

  // ── Submit button ──────────────────────────────────────────────────────────

  it('submit button is inactive (gray) when textarea is empty', () => {
    const prompt = new PromptInput(container)
    prompt.show()

    const ta = container.querySelector('textarea') as HTMLTextAreaElement
    ta.value = ''
    ta.dispatchEvent(new Event('input'))

    const btn = container.querySelector('[data-agent-overlay-submit]') as HTMLButtonElement
    expect(btn.style.background).not.toContain('2196f3')
    prompt.destroy()
  })

  it('submit button becomes active (blue) when textarea has text', () => {
    const prompt = new PromptInput(container)
    prompt.show()

    const ta = container.querySelector('textarea') as HTMLTextAreaElement
    ta.value = 'some text'
    ta.dispatchEvent(new Event('input'))

    const btn = container.querySelector('[data-agent-overlay-submit]') as HTMLButtonElement
    // jsdom may normalize hex to rgb, accept either form
    expect(btn.style.background).toMatch(/2196f3|rgb\(33,\s*150,\s*243\)/)
    prompt.destroy()
  })

  // ── getSelectedModel ───────────────────────────────────────────────────────

  it('getSelectedModel() returns selected model id', () => {
    const prompt = new PromptInput(container, { availableModels: MODELS })
    prompt.show()

    // Click the dropdown trigger to open it
    const trigger = container.querySelector('[data-dropdown-trigger]') as HTMLButtonElement
    trigger.click()

    // Click first item
    const firstItem = document.querySelector('[data-dropdown-item="gpt-4o"]') as HTMLElement
    expect(firstItem).not.toBeNull()
    firstItem.click()

    expect(prompt.getSelectedModel()).toBe('gpt-4o')
    prompt.destroy()
  })

  it('getSelectedModel() returns undefined when no model dropdown', () => {
    const prompt = new PromptInput(container)
    prompt.show()
    expect(prompt.getSelectedModel()).toBeUndefined()
    prompt.destroy()
  })

  // ── getSelectedPresets ─────────────────────────────────────────────────────

  it('getSelectedPresets() returns selected presets as AnalysisPreset objects', () => {
    const prompt = new PromptInput(container, { presets: PRESETS })
    prompt.show()

    // Open preset dropdown
    const trigger = container.querySelector('[data-dropdown-trigger]') as HTMLButtonElement
    trigger.click()

    // Click second preset item (first is pre-selected by default)
    const secondItem = document.querySelector('[data-dropdown-item="preset-1"]') as HTMLElement
    expect(secondItem).not.toBeNull()
    secondItem.click()

    const selected = prompt.getSelectedPresets()
    expect(selected).toHaveLength(2)
    expect(selected[0]).toEqual(PRESETS[0])
    expect(selected[1]).toEqual(PRESETS[1])
    prompt.destroy()
  })

  it('getSelectedPresets() returns empty array when no preset dropdown', () => {
    const prompt = new PromptInput(container)
    prompt.show()
    expect(prompt.getSelectedPresets()).toEqual([])
    prompt.destroy()
  })

  // ── onQuickRun ─────────────────────────────────────────────────────────────

  it('onQuickRun fires via Cmd+Enter when no text but presets selected', () => {
    const prompt = new PromptInput(container, { presets: PRESETS })
    const onQuickRun = vi.fn()
    prompt.onQuickRun = onQuickRun
    prompt.show()

    // First preset is pre-selected by default — just press Cmd+Enter
    const ta = container.querySelector('textarea') as HTMLTextAreaElement
    ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', metaKey: true, bubbles: true }))

    expect(onQuickRun).toHaveBeenCalled()
    const calledWith = onQuickRun.mock.calls[0][0] as readonly AnalysisPreset[]
    expect(calledWith).toHaveLength(1)
    expect(calledWith[0]).toEqual(PRESETS[0])
    prompt.destroy()
  })

  // ── showError ──────────────────────────────────────────────────────────────

  it('showError displays error message', () => {
    const prompt = new PromptInput(container)
    prompt.show()
    prompt.showError('Something went wrong')

    const errorEl = container.querySelector('[data-agent-overlay-error]') as HTMLElement
    expect(errorEl).not.toBeNull()
    expect(errorEl.textContent).toContain('Something went wrong')
    expect(errorEl.style.display).not.toBe('none')
    prompt.destroy()
  })

  it('showError auto-dismisses after 5s', () => {
    vi.useFakeTimers()
    const prompt = new PromptInput(container)
    prompt.show()
    prompt.showError('Oops')

    const errorEl = container.querySelector('[data-agent-overlay-error]') as HTMLElement
    expect(errorEl.style.display).not.toBe('none')

    vi.advanceTimersByTime(5000)

    expect(errorEl.style.display).toBe('none')
    vi.useRealTimers()
    prompt.destroy()
  })

  // ── setLoading ─────────────────────────────────────────────────────────────

  it('setLoading(true) disables textarea', () => {
    const prompt = new PromptInput(container)
    prompt.show()
    prompt.setLoading(true)

    const ta = container.querySelector('textarea') as HTMLTextAreaElement
    expect(ta.disabled).toBe(true)
    prompt.destroy()
  })

  it('setLoading(true) shows progress bar', () => {
    const prompt = new PromptInput(container)
    prompt.show()
    prompt.setLoading(true)

    const progress = container.querySelector('[data-agent-overlay-progress]') as HTMLElement
    expect(progress.style.display).not.toBe('none')
    prompt.destroy()
  })

  it('setLoading(false) re-enables textarea and hides progress bar', () => {
    const prompt = new PromptInput(container)
    prompt.show()
    prompt.setLoading(true)
    prompt.setLoading(false)

    const ta = container.querySelector('textarea') as HTMLTextAreaElement
    expect(ta.disabled).toBe(false)

    const progress = container.querySelector('[data-agent-overlay-progress]') as HTMLElement
    expect(progress.style.display).toBe('none')
    prompt.destroy()
  })

  // ── hide / destroy ─────────────────────────────────────────────────────────

  it('hide() removes element from container', () => {
    const prompt = new PromptInput(container)
    prompt.show()
    prompt.hide()
    expect(container.querySelector('[data-agent-overlay-prompt]')).toBeNull()
  })

  it('destroy() cleans up and nullifies callbacks', () => {
    const prompt = new PromptInput(container)
    prompt.onSubmit = vi.fn()
    prompt.onCancel = vi.fn()
    prompt.onQuickRun = vi.fn()
    prompt.show()
    prompt.destroy()

    expect(container.querySelector('[data-agent-overlay-prompt]')).toBeNull()
    expect(prompt.onSubmit).toBeNull()
    expect(prompt.onCancel).toBeNull()
    expect(prompt.onQuickRun).toBeNull()
  })

  // ── getLastPosition ────────────────────────────────────────────────────────

  it('getLastPosition() returns null before show', () => {
    const prompt = new PromptInput(container)
    expect(prompt.getLastPosition()).toBeNull()
    prompt.destroy()
  })

  it('getLastPosition() returns position passed to show()', () => {
    const prompt = new PromptInput(container)
    prompt.show({ left: 100, top: 200 })
    expect(prompt.getLastPosition()).toEqual({ left: 100, top: 200 })
    prompt.destroy()
  })

  // ── mousedown stopPropagation ──────────────────────────────────────────────

  it('stopPropagation on mousedown inside wrapper', () => {
    const prompt = new PromptInput(container)
    prompt.show()

    const outerHandler = vi.fn()
    document.addEventListener('mousedown', outerHandler)

    const wrapper = container.querySelector('[data-agent-overlay-prompt]') as HTMLElement
    wrapper.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))

    // The event should NOT reach the document listener because stopPropagation is called
    expect(outerHandler).not.toHaveBeenCalled()

    document.removeEventListener('mousedown', outerHandler)
    prompt.destroy()
  })
})
