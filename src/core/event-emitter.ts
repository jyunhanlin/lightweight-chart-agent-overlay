// src/core/event-emitter.ts

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type EventHandler = (...args: any[]) => void

// Constrains T so that every value must be a function, without requiring an index signature.
// This allows concrete interfaces like `{ ping: () => void }` to satisfy the constraint.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type EventMap<T> = { [K in keyof T]: (...args: any[]) => void }

export interface EventEmitter<T extends EventMap<T>> {
  on<K extends keyof T & string>(event: K, handler: T[K]): () => void
  emit<K extends keyof T & string>(event: K, ...args: Parameters<T[K]>): void
  removeAll(): void
}

export function createEventEmitter<T extends EventMap<T>>(): EventEmitter<T> {
  const handlers = new Map<keyof T, Set<EventHandler>>()

  return {
    on<K extends keyof T & string>(event: K, handler: T[K]): () => void {
      if (!handlers.has(event)) {
        handlers.set(event, new Set())
      }
      handlers.get(event)!.add(handler as EventHandler)

      return () => {
        handlers.get(event)?.delete(handler as EventHandler)
      }
    },

    emit<K extends keyof T & string>(event: K, ...args: Parameters<T[K]>): void {
      const set = handlers.get(event)
      if (!set) return
      for (const handler of set) {
        ;(handler as (...a: Parameters<T[K]>) => void)(...args)
      }
    },

    removeAll(): void {
      handlers.clear()
    },
  }
}
