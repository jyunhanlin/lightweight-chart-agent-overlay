// src/core/ui/explanation-popup.test.ts
import { ExplanationPopup } from './explanation-popup'

describe('ExplanationPopup', () => {
  let container: HTMLElement
  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
  })
  afterEach(() => {
    document.body.removeChild(container)
  })

  it('show() displays explanation text', () => {
    const popup = new ExplanationPopup(container)
    popup.show('This is a support level', { x: 100, y: 50 })
    const el = container.querySelector('[data-agent-overlay-explanation]')
    expect(el).not.toBeNull()
    expect(el!.textContent).toContain('This is a support level')
  })

  it('hide() removes element', () => {
    const popup = new ExplanationPopup(container)
    popup.show('text', { x: 100, y: 50 })
    popup.hide()
    expect(container.querySelector('[data-agent-overlay-explanation]')).toBeNull()
  })

  it('Escape key dismisses popup', () => {
    const popup = new ExplanationPopup(container)
    popup.show('text', { x: 100, y: 50 })
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    expect(container.querySelector('[data-agent-overlay-explanation]')).toBeNull()
  })

  it('close button dismisses popup', () => {
    const popup = new ExplanationPopup(container)
    popup.show('text', { x: 100, y: 50 })
    const closeBtn = container.querySelector('[data-agent-overlay-close]') as HTMLElement
    closeBtn.click()
    expect(container.querySelector('[data-agent-overlay-explanation]')).toBeNull()
  })

  it('destroy cleans up', () => {
    const popup = new ExplanationPopup(container)
    popup.show('text', { x: 100, y: 50 })
    popup.destroy()
    expect(container.querySelector('[data-agent-overlay-explanation]')).toBeNull()
  })
})
