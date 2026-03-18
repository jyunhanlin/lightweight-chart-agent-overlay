// src/core/ui/dropdown-manager.ts
import type { Dropdown } from './dropdown'

/**
 * Ensures only one dropdown is open at a time.
 * Register dropdowns with the manager, and it will close
 * others when one opens.
 */
export class DropdownManager {
  private readonly dropdowns: Set<Dropdown> = new Set()

  register(dropdown: Dropdown): void {
    this.dropdowns.add(dropdown)
  }

  unregister(dropdown: Dropdown): void {
    this.dropdowns.delete(dropdown)
  }

  closeAllExcept(keep: Dropdown): void {
    for (const dd of this.dropdowns) {
      if (dd !== keep) dd.close()
    }
  }

  closeAll(): void {
    for (const dd of this.dropdowns) {
      dd.close()
    }
  }

  destroy(): void {
    this.dropdowns.clear()
  }
}
