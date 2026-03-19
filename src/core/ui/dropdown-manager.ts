// src/core/ui/dropdown-manager.ts

export interface Closeable {
  close(): void
}

/**
 * Ensures only one dropdown is open at a time.
 * Register dropdowns with the manager, and it will close
 * others when one opens.
 */
export class DropdownManager {
  private readonly dropdowns: Set<Closeable> = new Set()

  register(dropdown: Closeable): void {
    this.dropdowns.add(dropdown)
  }

  unregister(dropdown: Closeable): void {
    this.dropdowns.delete(dropdown)
  }

  closeAllExcept(keep: Closeable): void {
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
