// src/core/event-emitter.ts

type EventMap = Record<string, (...args: never[]) => void>

export interface EventEmitter<T extends EventMap> {
  on<K extends keyof T>(event: K, handler: T[K]): () => void
  emit<K extends keyof T>(event: K, ...args: Parameters<T[K]>): void
  removeAll(): void
}

export function createEventEmitter<T extends EventMap>(): EventEmitter<T> {
  const handlers = new Map<keyof T, Set<T[keyof T]>>()

  return {
    on<K extends keyof T>(event: K, handler: T[K]): () => void {
      if (!handlers.has(event)) {
        handlers.set(event, new Set())
      }
      handlers.get(event)!.add(handler as T[keyof T])

      return () => {
        handlers.get(event)?.delete(handler as T[keyof T])
      }
    },

    emit<K extends keyof T>(event: K, ...args: Parameters<T[K]>): void {
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
