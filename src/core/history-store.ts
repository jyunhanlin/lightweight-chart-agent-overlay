import type { HistoryEntry } from './types'

export interface HistoryStore {
  push(entry: HistoryEntry): void
  updateLatest(entry: HistoryEntry): void
  get(index: number): HistoryEntry | undefined
  latest(): HistoryEntry | undefined
  getAll(): readonly HistoryEntry[]
  size(): number
  clear(): void
}

const DEFAULT_MAX_ENTRIES = 50

export function createHistoryStore(maxEntries = DEFAULT_MAX_ENTRIES): HistoryStore {
  let entries: HistoryEntry[] = []

  return {
    push(entry) {
      const next = [...entries, entry]
      entries = next.length > maxEntries ? next.slice(next.length - maxEntries) : next
    },

    updateLatest(entry) {
      if (entries.length === 0) throw new Error('No entries to update')
      entries = [...entries.slice(0, -1), entry]
    },

    get(index) {
      if (index < 0 || index >= entries.length) return undefined
      return entries[index]
    },

    latest() {
      return entries.length > 0 ? entries[entries.length - 1] : undefined
    },

    getAll() {
      return entries
    },

    size() {
      return entries.length
    },

    clear() {
      entries = []
    },
  }
}
