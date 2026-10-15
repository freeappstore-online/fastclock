import { describe, expect, it } from 'vitest'
import type { FastRecord } from './types'
import {
  FASTS_KEY,
  HOUR,
  MINUTE,
  customGoal,
  describeInstant,
  eatingWindowCountdown,
  eatingWindowMs,
  editActiveFastStart,
  editFast,
  elapsedMs,
  endFast,
  formatClock,
  fromLocalInput,
  lastFast,
  loadActiveFast,
  loadFasts,
  nextFastAt,
  presetGoal,
  saveActiveFast,
  saveFasts,
  startFast,
  toLocalInput,
} from './fast'

const NY = 'America/New_York'
const at = (iso: string) => new Date(iso).getTime()
const time = (instant: number, timeZone: string) =>
  new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', minute: '2-digit' }).format(instant)

function memoryStore() {
  const data = new Map<string, string>()
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
  }
}

// Two completed fasts in New York: Oct 20 8 PM–Oct 21 12 PM and Oct 22 8 PM–Oct 23 12 PM.
const A: FastRecord = {
  id: 'a',
  startMs: at('2026-10-20T20:00:00-04:00'),
  endMs: at('2026-10-21T12:00:00-04:00'),
  goalMs: 16 * HOUR,
}
const B: FastRecord = {
  id: 'b',
  startMs: at('2026-10-22T20:00:00-04:00'),
  endMs: at('2026-10-23T12:00:00-04:00'),
  goalMs: 16 * HOUR,
}
const NOW = at('2026-10-24T09:00:00-04:00')

function storeWith(fasts: FastRecord[]) {
  const store = memoryStore()
  saveFasts(store, fasts)
  return store
}

describe('ending a fast', () => {
  it('records the completed fast and clears the active one', () => {
    const store = memoryStore()
    const fast = startFast(presetGoal('18:6'), at('2026-10-31T20:00:00-04:00'))
    saveActiveFast(store, fast)
    const record = endFast(store, fast, at('2026-11-01T13:00:00-05:00'))
    expect(loadActiveFast(store)).toBeNull()
    expect(loadFasts(store)).toEqual([record])
    expect(record!.endMs - record!.startMs).toBe(18 * HOUR) // across fall-back
    expect(record!.goalMs).toBe(18 * HOUR)
  })

  it('does not record an accidental tap', () => {
    const store = memoryStore()
    const fast = startFast(presetGoal('16:8'), NOW)
    saveActiveFast(store, fast)
    expect(endFast(store, fast, NOW + 10_000)).toBeNull()
    expect(loadFasts(store)).toEqual([])
    expect(loadActiveFast(store)).toBeNull()
  })
})

describe('editing a past fast', () => {
  it('rejects an end before the start', () => {
    const store = storeWith([A, B])
    expect(editFast(store, 'a', { endMs: A.startMs - HOUR }, NOW)).toBe('The end time must be after the start time.')
    expect(editFast(store, 'a', { endMs: A.startMs }, NOW)).toBe('The end time must be after the start time.')
    expect(loadFasts(store)).toEqual([A, B])
  })

  it('rejects a future end time', () => {
    const store = storeWith([A, B])
    expect(editFast(store, 'b', { endMs: NOW + MINUTE }, NOW)).toBe("The end time can't be in the future.")
    expect(loadFasts(store)).toEqual([A, B])
  })

  it('rejects overlapping fasts', () => {
    const store = storeWith([A, B])
    // A's end moved into B.
    expect(editFast(store, 'a', { endMs: at('2026-10-22T21:00:00-04:00') }, NOW)).toMatch(/overlap another fast/)
    // B moved to wrap around A entirely.
    expect(editFast(store, 'b', { startMs: A.startMs - HOUR }, NOW)).toMatch(/overlap another fast/)
    expect(loadFasts(store)).toEqual([A, B])
  })

  it('allows a fast to end exactly when the next one starts', () => {
    const store = storeWith([A, B])
    expect(editFast(store, 'a', { endMs: B.startMs }, NOW)).toBeNull()
  })

  it('rejects times that overlap the running fast', () => {
    const store = storeWith([A, B])
    saveActiveFast(store, startFast(presetGoal('16:8'), at('2026-10-23T20:00:00-04:00')))
    expect(editFast(store, 'b', { endMs: at('2026-10-23T21:00:00-04:00') }, NOW)).toBe(
      'These times overlap your current fast.',
    )
  })

  it('rejects missing times and unknown fasts', () => {
    const store = storeWith([A])
    expect(editFast(store, 'a', { startMs: fromLocalInput('') }, NOW)).toBe('Enter both a start and an end time.')
    expect(editFast(store, 'zzz', { startMs: 0 }, NOW)).toBe('That fast no longer exists.')
  })

  it('persists a valid edit across reload', () => {
    const store = storeWith([A, B])
    const newStart = at('2026-10-20T18:30:00-04:00')
    expect(editFast(store, 'a', { startMs: newStart }, NOW)).toBeNull()
    const reloaded = loadFasts(store)
    expect(reloaded.find((f) => f.id === 'a')).toEqual({ ...A, startMs: newStart })
    expect(reloaded.find((f) => f.id === 'b')).toEqual(B)
  })

  it('ignores corrupt stored fasts', () => {
    const store = memoryStore()
    store.setItem(FASTS_KEY, JSON.stringify([A, { id: 'x', startMs: 5, endMs: 1, goalMs: HOUR }, null]))
    expect(loadFasts(store)).toEqual([A])
    store.setItem(FASTS_KEY, 'nope')
    expect(loadFasts(store)).toEqual([])
  })
})

describe('editing the running fast', () => {
  it('moves the start time and keeps the goal', () => {
    const store = storeWith([A, B])
    saveActiveFast(store, startFast(presetGoal('16:8'), at('2026-10-23T20:30:00-04:00')))
    const newStart = at('2026-10-23T19:00:00-04:00')
    expect(editActiveFastStart(store, newStart, NOW)).toBeNull()
    expect(loadActiveFast(store)).toEqual({ presetId: '16:8', goalMs: 16 * HOUR, startedAt: newStart })
    expect(elapsedMs(loadActiveFast(store)!, NOW)).toBe(14 * HOUR)
  })

  it('rejects a start in the future', () => {
    const store = memoryStore()
    saveActiveFast(store, startFast(presetGoal('16:8'), NOW - HOUR))
    expect(editActiveFastStart(store, NOW + MINUTE, NOW)).toBe("The start time can't be in the future.")
    expect(loadActiveFast(store)!.startedAt).toBe(NOW - HOUR)
  })

  it('rejects a start before the last fast ended', () => {
    const store = storeWith([A, B])
    saveActiveFast(store, startFast(presetGoal('16:8'), NOW - HOUR))
    expect(editActiveFastStart(store, B.endMs - MINUTE, NOW)).toMatch(/after your last fast ended/)
    expect(editActiveFastStart(store, B.endMs, NOW)).toBeNull()
  })

  it('rejects editing when no fast is running', () => {
    expect(editActiveFastStart(memoryStore(), NOW - HOUR, NOW)).toBe('There is no fast running.')
  })
})

describe('eating window', () => {
  it('is the rest of the daily cycle for each preset', () => {
    expect(eatingWindowMs(presetGoal('13:11').goalMs)).toBe(11 * HOUR)
    expect(eatingWindowMs(presetGoal('16:8').goalMs)).toBe(8 * HOUR)
    expect(eatingWindowMs(presetGoal('18:6').goalMs)).toBe(6 * HOUR)
    expect(eatingWindowMs(presetGoal('20:4').goalMs)).toBe(4 * HOUR)
    expect(eatingWindowMs(presetGoal('omad').goalMs)).toBe(1 * HOUR)
    expect(eatingWindowMs(presetGoal('36h').goalMs)).toBe(12 * HOUR)
    expect(eatingWindowMs(customGoal(14.5).goalMs)).toBe(9 * HOUR + 30 * MINUTE)
    expect(eatingWindowMs(customGoal(24).goalMs)).toBe(24 * HOUR)
  })

  it('counts down mid-window', () => {
    // B ended at noon; with 16:8 the next fast starts at 8 PM.
    const now = at('2026-10-23T15:15:00-04:00')
    expect(formatClock(eatingWindowCountdown(B, 16 * HOUR, now))).toBe('04:45:00')
    expect(describeInstant(nextFastAt(B, 16 * HOUR), now, 'en-US', NY)).toBe('today at 8:00 PM')
  })

  it('is 0 once the window has passed', () => {
    expect(eatingWindowCountdown(B, 16 * HOUR, at('2026-10-23T20:00:00-04:00'))).toBe(0)
    expect(eatingWindowCountdown(B, 16 * HOUR, NOW)).toBe(0)
  })

  it('is correct across fall-back', () => {
    // 20:4 fast ends 11 PM EDT Oct 31; the 4h window spans the repeated 1 AM hour.
    const last: FastRecord = {
      id: 'x',
      startMs: at('2026-10-31T03:00:00-04:00'),
      endMs: at('2026-10-31T23:00:00-04:00'),
      goalMs: 20 * HOUR,
    }
    const start = nextFastAt(last, last.goalMs)
    expect(start - last.endMs).toBe(4 * HOUR)
    expect(time(start, NY)).toBe('2:00 AM') // EST: the wall clock only moved 3 hours
    expect(eatingWindowCountdown(last, last.goalMs, at('2026-11-01T01:30:00-04:00'))).toBe(1 * HOUR + 30 * MINUTE)
    expect(eatingWindowCountdown(last, last.goalMs, at('2026-11-01T01:30:00-05:00'))).toBe(30 * MINUTE)
  })

  it('is correct across spring-forward', () => {
    // 16:8 fast ends 10 PM EST Mar 7; the 8h window loses an hour of wall clock.
    const last: FastRecord = {
      id: 'y',
      startMs: at('2026-03-07T06:00:00-05:00'),
      endMs: at('2026-03-07T22:00:00-05:00'),
      goalMs: 16 * HOUR,
    }
    expect(time(nextFastAt(last, 16 * HOUR), NY)).toBe('7:00 AM')
    expect(eatingWindowCountdown(last, 16 * HOUR, at('2026-03-08T03:00:00-04:00'))).toBe(4 * HOUR)
  })

  it('uses the most recently ended fast', () => {
    expect(lastFast([B, A])).toBe(B)
    expect(lastFast([])).toBeNull()
  })
})

describe('datetime-local values (TZ=America/New_York)', () => {
  it('round-trips local wall-clock times, including across DST', () => {
    for (const iso of ['2026-07-14T20:00:00-04:00', '2026-03-08T03:30:00-04:00', '2026-11-01T12:15:00-05:00']) {
      expect(fromLocalInput(toLocalInput(at(iso)))).toBe(at(iso))
    }
    expect(toLocalInput(at('2026-03-08T03:30:00-04:00'))).toBe('2026-03-08T03:30')
    expect(fromLocalInput('2026-11-01T12:15')).toBe(at('2026-11-01T12:15:00-05:00'))
    expect(fromLocalInput('')).toBeNaN()
  })
})
