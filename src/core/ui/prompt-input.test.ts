// src/core/ui/prompt-input.test.ts
import { PromptInput } from './prompt-input'

describe('PromptInput', () => {
  let container: HTMLElement
  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
  })
  afterEach(() => {
    document.body.removeChild(container)
  })

  it('show() adds input element to container', () => {
    const input = new PromptInput(container)
    input.show()
    expect(container.querySelector('[data-agent-overlay-prompt]')).not.toBeNull()
  })

  it('hide() removes element from container', () => {
    const input = new PromptInput(container)
    input.show()
    input.hide()
    expect(container.querySelector('[data-agent-overlay-prompt]')).toBeNull()
  })

  it('calls onSubmit when Enter is pressed', () => {
    const input = new PromptInput(container)
    const onSubmit = vi.fn()
    input.onSubmit = onSubmit
    input.show()
    const inputEl = container.querySelector('input') as HTMLInputElement
    inputEl.value = 'Draw support lines'
    inputEl.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    expect(onSubmit).toHaveBeenCalledWith('Draw support lines')
  })

  it('does not call onSubmit for empty input', () => {
    const input = new PromptInput(container)
    const onSubmit = vi.fn()
    input.onSubmit = onSubmit
    input.show()
    const inputEl = container.querySelector('input') as HTMLInputElement
    inputEl.value = '   '
    inputEl.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('hides on Escape key', () => {
    const input = new PromptInput(container)
    input.show()
    const inputEl = container.querySelector('input') as HTMLInputElement
    inputEl.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    expect(container.querySelector('[data-agent-overlay-prompt]')).toBeNull()
  })

  it('setLoading shows loading indicator', () => {
    const input = new PromptInput(container)
    input.show()
    input.setLoading(true)
    const inputEl = container.querySelector('input') as HTMLInputElement
    expect(inputEl.disabled).toBe(true)
  })

  it('destroy cleans up', () => {
    const input = new PromptInput(container)
    input.show()
    input.destroy()
    expect(container.querySelector('[data-agent-overlay-prompt]')).toBeNull()
  })
})
