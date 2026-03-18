import { describe, it, expect } from 'vitest'
import { createHistoryStore } from './history-store'
import type { HistoryEntry } from './types'

function makeEntry(prompt: string): HistoryEntry {
  return {
    prompt,
    isQuickRun: false,
    presets: [],
    result: {},
    range: { from: 1, to: 2 },
  }
}

describe('createHistoryStore', () => {
  it('should start empty', () => {
    const store = createHistoryStore()
    expect(store.getAll()).toEqual([])
    expect(store.size()).toBe(0)
  })

  it('should push and retrieve entries', () => {
    const store = createHistoryStore()
    const entry = makeEntry('test')
    store.push(entry)
    expect(store.size()).toBe(1)
    expect(store.getAll()[0]).toBe(entry)
  })

  it('should get entry by index', () => {
    const store = createHistoryStore()
    const e1 = makeEntry('first')
    const e2 = makeEntry('second')
    store.push(e1)
    store.push(e2)
    expect(store.get(0)).toBe(e1)
    expect(store.get(1)).toBe(e2)
  })

  it('should return undefined for out-of-bounds index', () => {
    const store = createHistoryStore()
    expect(store.get(0)).toBeUndefined()
    expect(store.get(-1)).toBeUndefined()
  })

  it('should return latest entry', () => {
    const store = createHistoryStore()
    store.push(makeEntry('first'))
    store.push(makeEntry('second'))
    expect(store.latest()?.prompt).toBe('second')
  })

  it('should return undefined for latest when empty', () => {
    const store = createHistoryStore()
    expect(store.latest()).toBeUndefined()
  })

  it('should cap at maxEntries and drop oldest', () => {
    const store = createHistoryStore(3)
    store.push(makeEntry('a'))
    store.push(makeEntry('b'))
    store.push(makeEntry('c'))
    store.push(makeEntry('d'))
    expect(store.size()).toBe(3)
    expect(store.get(0)?.prompt).toBe('b')
    expect(store.get(2)?.prompt).toBe('d')
  })

  it('should clear all entries', () => {
    const store = createHistoryStore()
    store.push(makeEntry('a'))
    store.push(makeEntry('b'))
    store.clear()
    expect(store.size()).toBe(0)
    expect(store.getAll()).toEqual([])
  })
})
