// src/core/settings-store.ts

export interface OverlaySettings {
  readonly systemPrompt?: string
  readonly temperature?: number
  readonly maxTokens?: number
}

export interface SettingsStore {
  get(): OverlaySettings
  set(partial: Partial<OverlaySettings>): void
  reset(field: keyof OverlaySettings): void
  clear(): void
}

const DEFAULT_STORAGE_KEY = 'agent-overlay-settings'

export function createSettingsStore(storageKey = DEFAULT_STORAGE_KEY): SettingsStore {
  function read(): Record<string, unknown> {
    const raw = localStorage.getItem(storageKey)
    if (!raw) return {}
    try {
      const parsed = JSON.parse(raw)
      return typeof parsed === 'object' && parsed !== null ? parsed : {}
    } catch {
      return {}
    }
  }

  function persist(next: OverlaySettings): void {
    if (Object.keys(next).length === 0) {
      localStorage.removeItem(storageKey)
    } else {
      localStorage.setItem(storageKey, JSON.stringify(next))
    }
  }

  const store: SettingsStore = {
    get(): OverlaySettings {
      const raw = read()
      const out: { systemPrompt?: string; temperature?: number; maxTokens?: number } = {}
      if (typeof raw.systemPrompt === 'string') out.systemPrompt = raw.systemPrompt
      if (typeof raw.temperature === 'number') out.temperature = raw.temperature
      if (typeof raw.maxTokens === 'number') out.maxTokens = raw.maxTokens
      return out
    },

    set(partial: Partial<OverlaySettings>): void {
      const next: { systemPrompt?: string; temperature?: number; maxTokens?: number } = {
        ...store.get(),
      }

      if ('systemPrompt' in partial) {
        const v = partial.systemPrompt
        const s = typeof v === 'string' ? v.trim() : ''
        if (s === '') delete next.systemPrompt
        else next.systemPrompt = s
      }

      if ('temperature' in partial) {
        const n = Number(partial.temperature)
        if (partial.temperature === undefined || !Number.isFinite(n)) delete next.temperature
        else next.temperature = Math.min(1, Math.max(0, n))
      }

      if ('maxTokens' in partial) {
        const n = Math.floor(Number(partial.maxTokens))
        if (partial.maxTokens === undefined || !Number.isFinite(n) || n <= 0) delete next.maxTokens
        else next.maxTokens = n
      }

      persist(next)
    },

    reset(field: keyof OverlaySettings): void {
      const next = { ...store.get() }
      delete next[field]
      persist(next)
    },

    clear(): void {
      localStorage.removeItem(storageKey)
    },
  }

  return store
}
