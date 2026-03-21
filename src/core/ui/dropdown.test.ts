import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { Dropdown } from './dropdown'

const ITEMS = [
  { id: 'technical', label: 'Technical' },
  { id: 'entry', label: 'Entry/Exit' },
  { id: 'sentiment', label: 'Sentiment' },
]

function getPanel(): HTMLElement | null {
  return document.querySelector('[data-dropdown-panel]')
}

function getItem(id: string): HTMLElement | null {
  return document.querySelector(`[data-dropdown-item="${id}"]`)
}

function getRunBtn(): HTMLButtonElement | null {
  return document.querySelector('[data-dropdown-run]')
}

function getTrigger(dropdown: Dropdown): HTMLButtonElement {
  return dropdown.element as HTMLButtonElement
}

describe('Dropdown', () => {
  let container: HTMLElement

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
  })

  afterEach(() => {
    document.body.innerHTML = ''
  })

  describe('single-select', () => {
    it('should render button with placeholder when nothing selected', () => {
      const d = new Dropdown({ items: ITEMS, placeholder: 'Select model' })
      container.appendChild(d.element)
      expect(getTrigger(d).textContent).toBe('Select model')
      d.destroy()
    })

    it('should open panel on button click', () => {
      const d = new Dropdown({ items: ITEMS })
      container.appendChild(d.element)

      getTrigger(d).click()
      expect(getPanel()).not.toBeNull()
      d.destroy()
    })

    it('should close panel on second button click', () => {
      const d = new Dropdown({ items: ITEMS })
      container.appendChild(d.element)

      getTrigger(d).click()
      expect(getPanel()).not.toBeNull()

      getTrigger(d).click()
      expect(getPanel()).toBeNull()
      d.destroy()
    })

    it('should select item and close panel', () => {
      const d = new Dropdown({ items: ITEMS })
      container.appendChild(d.element)

      getTrigger(d).click()
      getItem('technical')?.click()

      expect(getPanel()).toBeNull()
      d.destroy()
    })

    it('should update button label to selected item', () => {
      const d = new Dropdown({ items: ITEMS })
      container.appendChild(d.element)

      getTrigger(d).click()
      getItem('technical')?.click()

      expect(getTrigger(d).textContent).toBe('Technical')
      d.destroy()
    })

    it('should call onSelect with selected item', () => {
      const onSelect = vi.fn()
      const d = new Dropdown({ items: ITEMS, onSelect })
      container.appendChild(d.element)

      getTrigger(d).click()
      getItem('entry')?.click()

      expect(onSelect).toHaveBeenCalledWith([{ id: 'entry', label: 'Entry/Exit' }])
      d.destroy()
    })

    it('should close on Escape', () => {
      const d = new Dropdown({ items: ITEMS })
      container.appendChild(d.element)

      getTrigger(d).click()
      expect(getPanel()).not.toBeNull()

      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
      expect(getPanel()).toBeNull()
      d.destroy()
    })
  })

  describe('multi-select', () => {
    it('should render checkboxes for each item', () => {
      const d = new Dropdown({ items: ITEMS, multiSelect: true })
      container.appendChild(d.element)

      getTrigger(d).click()
      const checkboxes = document.querySelectorAll('[data-dropdown-checkbox]')
      expect(checkboxes).toHaveLength(ITEMS.length)
      d.destroy()
    })

    it('should toggle checkbox on click', () => {
      const d = new Dropdown({ items: ITEMS, multiSelect: true })
      container.appendChild(d.element)

      getTrigger(d).click()
      getItem('technical')?.click()

      expect(d.getSelected()).toEqual([{ id: 'technical', label: 'Technical' }])

      // Toggle off
      getItem('technical')?.click()
      expect(d.getSelected()).toHaveLength(0)
      d.destroy()
    })

    it('should stay open after toggle', () => {
      const d = new Dropdown({ items: ITEMS, multiSelect: true })
      container.appendChild(d.element)

      getTrigger(d).click()
      getItem('technical')?.click()

      expect(getPanel()).not.toBeNull()
      d.destroy()
    })

    it('should show "\u2014" when none selected', () => {
      const d = new Dropdown({ items: ITEMS, multiSelect: true })
      container.appendChild(d.element)
      expect(getTrigger(d).textContent).toBe('\u2014')
      d.destroy()
    })

    it('should show single label when one selected', () => {
      const d = new Dropdown({ items: ITEMS, multiSelect: true })
      container.appendChild(d.element)

      getTrigger(d).click()
      getItem('technical')?.click()

      expect(getTrigger(d).textContent).toBe('Technical')
      d.destroy()
    })

    it('should show comma-separated for two selected', () => {
      const d = new Dropdown({ items: ITEMS, multiSelect: true })
      container.appendChild(d.element)

      getTrigger(d).click()
      getItem('technical')?.click()
      getItem('entry')?.click()

      expect(getTrigger(d).textContent).toBe('Technical, Entry/Exit')
      d.destroy()
    })

    it('should show +N for three or more selected', () => {
      const d = new Dropdown({ items: ITEMS, multiSelect: true })
      container.appendChild(d.element)

      getTrigger(d).click()
      getItem('technical')?.click()
      getItem('entry')?.click()
      getItem('sentiment')?.click()

      expect(getTrigger(d).textContent).toBe('Technical, Entry/Exit +1')
      d.destroy()
    })

    it('should call onSelect after each toggle', () => {
      const onSelect = vi.fn()
      const d = new Dropdown({ items: ITEMS, multiSelect: true, onSelect })
      container.appendChild(d.element)

      getTrigger(d).click()
      getItem('technical')?.click()
      expect(onSelect).toHaveBeenCalledTimes(1)
      expect(onSelect).toHaveBeenLastCalledWith([{ id: 'technical', label: 'Technical' }])

      getItem('entry')?.click()
      expect(onSelect).toHaveBeenCalledTimes(2)
      expect(onSelect).toHaveBeenLastCalledWith([
        { id: 'technical', label: 'Technical' },
        { id: 'entry', label: 'Entry/Exit' },
      ])
      d.destroy()
    })

    it('should show Run button when showRun is true', () => {
      const d = new Dropdown({ items: ITEMS, multiSelect: true, showRun: true })
      container.appendChild(d.element)

      getTrigger(d).click()
      expect(getRunBtn()).not.toBeNull()
      d.destroy()
    })

    it('should disable Run when none selected', () => {
      const d = new Dropdown({ items: ITEMS, multiSelect: true, showRun: true })
      container.appendChild(d.element)

      getTrigger(d).click()
      expect(getRunBtn()?.disabled).toBe(true)
      d.destroy()
    })

    it('should call onRun with selected items', () => {
      const onRun = vi.fn()
      const d = new Dropdown({ items: ITEMS, multiSelect: true, showRun: true, onRun })
      container.appendChild(d.element)

      getTrigger(d).click()
      getItem('technical')?.click()
      getRunBtn()?.click()

      expect(onRun).toHaveBeenCalledWith([{ id: 'technical', label: 'Technical' }])
      d.destroy()
    })

    it('should close panel after Run click', () => {
      const d = new Dropdown({ items: ITEMS, multiSelect: true, showRun: true })
      container.appendChild(d.element)

      getTrigger(d).click()
      getItem('technical')?.click()
      getRunBtn()?.click()

      expect(getPanel()).toBeNull()
      d.destroy()
    })
  })

  describe('common', () => {
    it('should stop mousedown propagation', () => {
      const d = new Dropdown({ items: ITEMS })
      container.appendChild(d.element)

      const propagated = vi.fn()
      container.addEventListener('mousedown', propagated)

      const mousedown = new MouseEvent('mousedown', { bubbles: true })
      d.element.dispatchEvent(mousedown)

      expect(propagated).not.toHaveBeenCalled()
      d.destroy()
    })

    it('should close on click outside', () => {
      const d = new Dropdown({ items: ITEMS })
      container.appendChild(d.element)

      getTrigger(d).click()
      expect(getPanel()).not.toBeNull()

      const outside = document.createElement('div')
      document.body.appendChild(outside)
      outside.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))

      expect(getPanel()).toBeNull()
      d.destroy()
    })

    it('touchstart outside closes the dropdown', () => {
      const d = new Dropdown({ items: ITEMS })
      container.appendChild(d.element)

      // Open the dropdown first
      d.element.click()
      expect(document.querySelector('[data-dropdown-panel]')).not.toBeNull()

      // Simulate touchstart outside (jsdom lacks Touch constructor; use plain object cast)
      const touch = {
        identifier: 0,
        target: document.body,
        clientX: 0,
        clientY: 0,
        pageX: 0,
        pageY: 0,
        screenX: 0,
        screenY: 0,
        radiusX: 0,
        radiusY: 0,
        rotationAngle: 0,
        force: 1,
      } as Touch
      document.dispatchEvent(new TouchEvent('touchstart', { touches: [touch], bubbles: true }))

      expect(document.querySelector('[data-dropdown-panel]')).toBeNull()
      d.destroy()
    })

    it('should clean up listeners on destroy', () => {
      const removeSpy = vi.spyOn(document, 'removeEventListener')
      const d = new Dropdown({ items: ITEMS })
      container.appendChild(d.element)

      d.destroy()

      expect(removeSpy).toHaveBeenCalledWith('mousedown', expect.any(Function))
      expect(removeSpy).toHaveBeenCalledWith('keydown', expect.any(Function))
      removeSpy.mockRestore()
    })
  })

  describe('setSelected', () => {
    it('should programmatically set selection and update label', () => {
      const d = new Dropdown({ items: ITEMS, multiSelect: true })
      container.appendChild(d.element)

      d.setSelected(['technical', 'entry'])
      expect(d.getSelected()).toEqual([
        { id: 'technical', label: 'Technical' },
        { id: 'entry', label: 'Entry/Exit' },
      ])
      expect(getTrigger(d).textContent).toBe('Technical, Entry/Exit')
      d.destroy()
    })

    it('should refresh panel if open when setSelected is called', () => {
      const d = new Dropdown({ items: ITEMS, multiSelect: true })
      container.appendChild(d.element)

      getTrigger(d).click()
      d.setSelected(['technical'])

      // Panel should still be open and item should be updated
      expect(getPanel()).not.toBeNull()
      d.destroy()
    })
  })
})
