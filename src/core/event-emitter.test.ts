// src/core/event-emitter.test.ts
import { createEventEmitter } from './event-emitter'

interface TestEvents {
  ping: () => void
  data: (value: number) => void
  error: (err: Error) => void
}

describe('createEventEmitter', () => {
  it('calls handler when event is emitted', () => {
    const emitter = createEventEmitter<TestEvents>()
    const handler = vi.fn()

    emitter.on('ping', handler)
    emitter.emit('ping')

    expect(handler).toHaveBeenCalledOnce()
  })

  it('passes arguments to handler', () => {
    const emitter = createEventEmitter<TestEvents>()
    const handler = vi.fn()

    emitter.on('data', handler)
    emitter.emit('data', 42)

    expect(handler).toHaveBeenCalledWith(42)
  })

  it('returns unsubscribe function from on()', () => {
    const emitter = createEventEmitter<TestEvents>()
    const handler = vi.fn()

    const unsub = emitter.on('ping', handler)
    unsub()
    emitter.emit('ping')

    expect(handler).not.toHaveBeenCalled()
  })

  it('supports multiple handlers for same event', () => {
    const emitter = createEventEmitter<TestEvents>()
    const h1 = vi.fn()
    const h2 = vi.fn()

    emitter.on('ping', h1)
    emitter.on('ping', h2)
    emitter.emit('ping')

    expect(h1).toHaveBeenCalledOnce()
    expect(h2).toHaveBeenCalledOnce()
  })

  it('removeAll clears all handlers', () => {
    const emitter = createEventEmitter<TestEvents>()
    const h1 = vi.fn()
    const h2 = vi.fn()

    emitter.on('ping', h1)
    emitter.on('data', h2)
    emitter.removeAll()
    emitter.emit('ping')
    emitter.emit('data', 1)

    expect(h1).not.toHaveBeenCalled()
    expect(h2).not.toHaveBeenCalled()
  })

  it('unsubscribing same handler twice is safe', () => {
    const emitter = createEventEmitter<TestEvents>()
    const handler = vi.fn()

    const unsub = emitter.on('ping', handler)
    unsub()
    unsub() // should not throw

    expect(handler).not.toHaveBeenCalled()
  })
})
