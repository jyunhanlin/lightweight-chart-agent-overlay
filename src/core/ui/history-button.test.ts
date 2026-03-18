import { describe, it, expect, vi, beforeEach } from 'vitest'
import { HistoryButton } from './history-button'

describe('HistoryButton', () => {
  let container: HTMLElement
  let button: HistoryButton

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    button = new HistoryButton(container)
  })

  it('should be hidden when count is 0', () => {
    button.setCount(0)
    const el = container.querySelector('[data-agent-overlay-history]') as HTMLElement
    expect(el?.style.display).toBe('none')
  })

  it('should be visible when count > 0', () => {
    button.setCount(3)
    const el = container.querySelector('[data-agent-overlay-history]') as HTMLElement
    expect(el?.style.display).not.toBe('none')
  })

  it('should show badge with count', () => {
    button.setCount(5)
    const el = container.querySelector('[data-agent-overlay-history]') as HTMLElement
    expect(el?.textContent).toContain('5')
  })

  it('should update badge when count changes', () => {
    button.setCount(3)
    button.setCount(7)
    const el = container.querySelector('[data-agent-overlay-history]') as HTMLElement
    expect(el?.textContent).toContain('7')
    expect(el?.textContent).not.toContain('3')
  })

  it('should fire onClick when clicked', () => {
    const onClick = vi.fn()
    button.onClick = onClick
    button.setCount(1)
    const el = container.querySelector('[data-agent-overlay-history]') as HTMLElement
    el?.click()
    expect(onClick).toHaveBeenCalledOnce()
  })

  it('should stop mousedown propagation', () => {
    button.setCount(1)
    const el = container.querySelector('[data-agent-overlay-history]') as HTMLElement
    const event = new MouseEvent('mousedown', { bubbles: true })
    const spy = vi.spyOn(event, 'stopPropagation')
    el?.dispatchEvent(event)
    expect(spy).toHaveBeenCalled()
  })

  it('should hide when count set to 0', () => {
    button.setCount(5)
    button.setCount(0)
    const el = container.querySelector('[data-agent-overlay-history]') as HTMLElement
    expect(el?.style.display).toBe('none')
  })

  it('should remove element on destroy', () => {
    button.setCount(1)
    button.destroy()
    expect(container.querySelector('[data-agent-overlay-history]')).toBeNull()
  })
})
