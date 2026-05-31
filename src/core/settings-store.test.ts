// src/core/settings-store.test.ts
import { createSettingsStore } from './settings-store'

const KEY = 'test-settings'

describe('createSettingsStore', () => {
  beforeEach(() => localStorage.clear())
  afterEach(() => localStorage.clear())

  it('get() returns {} when nothing is stored', () => {
    expect(createSettingsStore(KEY).get()).toEqual({})
  })

  it('get() returns {} on corrupt JSON', () => {
    localStorage.setItem(KEY, 'not-json{')
    expect(createSettingsStore(KEY).get()).toEqual({})
  })

  it('set() persists and get() returns the value', () => {
    const store = createSettingsStore(KEY)
    store.set({ systemPrompt: 'hello', temperature: 0.5, maxTokens: 1000 })
    expect(createSettingsStore(KEY).get()).toEqual({
      systemPrompt: 'hello',
      temperature: 0.5,
      maxTokens: 1000,
    })
  })

  it('set() merges with existing values', () => {
    const store = createSettingsStore(KEY)
    store.set({ temperature: 0.5 })
    store.set({ maxTokens: 2000 })
    expect(store.get()).toEqual({ temperature: 0.5, maxTokens: 2000 })
  })

  it('set() clamps temperature to [0, 1]', () => {
    const store = createSettingsStore(KEY)
    store.set({ temperature: 5 })
    expect(store.get().temperature).toBe(1)
    store.set({ temperature: -3 })
    expect(store.get().temperature).toBe(0)
  })

  it('set() keeps temperature 0 (not dropped as falsy)', () => {
    const store = createSettingsStore(KEY)
    store.set({ temperature: 0 })
    expect(store.get().temperature).toBe(0)
  })

  it('set() coerces maxTokens to a positive integer and ignores invalid', () => {
    const store = createSettingsStore(KEY)
    store.set({ maxTokens: 100.7 })
    expect(store.get().maxTokens).toBe(100)
    store.set({ maxTokens: -5 })
    expect(store.get().maxTokens).toBeUndefined()
  })

  it('set() treats empty-string systemPrompt as unset', () => {
    const store = createSettingsStore(KEY)
    store.set({ systemPrompt: 'x' })
    store.set({ systemPrompt: '   ' })
    expect(store.get().systemPrompt).toBeUndefined()
  })

  it('set() with undefined deletes a field', () => {
    const store = createSettingsStore(KEY)
    store.set({ temperature: 0.5 })
    store.set({ temperature: undefined })
    expect(store.get().temperature).toBeUndefined()
  })

  it('reset() removes a single field, leaving others', () => {
    const store = createSettingsStore(KEY)
    store.set({ systemPrompt: 'p', temperature: 0.5 })
    store.reset('temperature')
    expect(store.get()).toEqual({ systemPrompt: 'p' })
  })

  it('clear() removes the whole blob', () => {
    const store = createSettingsStore(KEY)
    store.set({ systemPrompt: 'p' })
    store.clear()
    expect(localStorage.getItem(KEY)).toBeNull()
    expect(store.get()).toEqual({})
  })
})
