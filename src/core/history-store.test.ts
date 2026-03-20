import { describe, it, expect } from 'vitest'
import { createHistoryStore } from './history-store'
import type { HistoryEntry, ChatTurn } from './types'

function makeTurn(overrides: Partial<ChatTurn> = {}): ChatTurn {
  return {
    userMessage: 'test question',
    rawResponse: 'test response',
    result: {},
    model: 'test-model',
    presets: [],
    ...overrides,
  }
}

function makeEntry(overrides: Partial<HistoryEntry> = {}): HistoryEntry {
  return {
    turns: [makeTurn()],
    range: { from: 1000, to: 2000 },
    ...overrides,
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
    const entry = makeEntry()
    store.push(entry)
    expect(store.size()).toBe(1)
    expect(store.getAll()[0]).toBe(entry)
  })

  it('should get entry by index', () => {
    const store = createHistoryStore()
    const e1 = makeEntry({ turns: [makeTurn({ userMessage: 'first' })] })
    const e2 = makeEntry({ turns: [makeTurn({ userMessage: 'second' })] })
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
    store.push(makeEntry({ turns: [makeTurn({ userMessage: 'first' })] }))
    const second = makeEntry({ turns: [makeTurn({ userMessage: 'second' })] })
    store.push(second)
    expect(store.latest()).toBe(second)
  })

  it('should return undefined for latest when empty', () => {
    const store = createHistoryStore()
    expect(store.latest()).toBeUndefined()
  })

  it('should cap at maxEntries and drop oldest', () => {
    const store = createHistoryStore(3)
    store.push(makeEntry({ turns: [makeTurn({ userMessage: 'a' })] }))
    store.push(makeEntry({ turns: [makeTurn({ userMessage: 'b' })] }))
    store.push(makeEntry({ turns: [makeTurn({ userMessage: 'c' })] }))
    store.push(makeEntry({ turns: [makeTurn({ userMessage: 'd' })] }))
    expect(store.size()).toBe(3)
    expect(store.get(0)!.turns[0].userMessage).toBe('b')
    expect(store.get(2)!.turns[0].userMessage).toBe('d')
  })

  it('should clear all entries', () => {
    const store = createHistoryStore()
    store.push(makeEntry())
    store.push(makeEntry())
    store.clear()
    expect(store.size()).toBe(0)
    expect(store.getAll()).toEqual([])
  })

  it('updateLatest replaces the last entry', () => {
    const store = createHistoryStore()
    const entry1 = makeEntry({ turns: [makeTurn({ userMessage: 'q1' })] })
    store.push(entry1)

    const updated = { ...entry1, turns: [...entry1.turns, makeTurn({ userMessage: 'q2' })] }
    store.updateLatest(updated)

    expect(store.size()).toBe(1)
    expect(store.get(0)!.turns).toHaveLength(2)
    expect(store.get(0)!.turns[1].userMessage).toBe('q2')
  })

  it('updateLatest throws when store is empty', () => {
    const store = createHistoryStore()
    expect(() => store.updateLatest(makeEntry())).toThrow()
  })

  it('updateLatest does not increase size', () => {
    const store = createHistoryStore()
    store.push(makeEntry())
    store.push(makeEntry())
    store.updateLatest(makeEntry({ turns: [makeTurn(), makeTurn()] }))
    expect(store.size()).toBe(2)
  })
})
