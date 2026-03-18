import { describe, it, expect, vi } from 'vitest'
import { DropdownManager } from './dropdown-manager'

function createMockDropdown() {
  return { close: vi.fn() }
}

describe('DropdownManager', () => {
  it('should close all dropdowns except the specified one', () => {
    const manager = new DropdownManager()
    const dd1 = createMockDropdown()
    const dd2 = createMockDropdown()
    const dd3 = createMockDropdown()
    manager.register(dd1 as any)
    manager.register(dd2 as any)
    manager.register(dd3 as any)

    manager.closeAllExcept(dd2 as any)

    expect(dd1.close).toHaveBeenCalledOnce()
    expect(dd2.close).not.toHaveBeenCalled()
    expect(dd3.close).toHaveBeenCalledOnce()
  })

  it('should close all dropdowns', () => {
    const manager = new DropdownManager()
    const dd1 = createMockDropdown()
    const dd2 = createMockDropdown()
    manager.register(dd1 as any)
    manager.register(dd2 as any)

    manager.closeAll()

    expect(dd1.close).toHaveBeenCalledOnce()
    expect(dd2.close).toHaveBeenCalledOnce()
  })

  it('should unregister a dropdown', () => {
    const manager = new DropdownManager()
    const dd1 = createMockDropdown()
    manager.register(dd1 as any)
    manager.unregister(dd1 as any)

    manager.closeAll()

    expect(dd1.close).not.toHaveBeenCalled()
  })

  it('should clear all on destroy', () => {
    const manager = new DropdownManager()
    const dd1 = createMockDropdown()
    manager.register(dd1 as any)
    manager.destroy()

    manager.closeAll()

    expect(dd1.close).not.toHaveBeenCalled()
  })
})
