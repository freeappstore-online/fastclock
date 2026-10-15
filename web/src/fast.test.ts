import { describe, expect, it } from 'vitest'
import {
  ACTIVE_KEY,
  HOUR,
  MINUTE,
  calendarDaysBetween,
  customGoal,
  describeInstant,
  elapsedMs,
  formatClock,
  formatGoal,
  goalReachedAt,
  loadActiveFast,
  loadGoal,
  presetGoal,
  progress,
  remainingMs,
  saveActiveFast,
  saveGoal,
  splitDuration,
  startFast,
} from './fast'

const NY = 'America/New_York'
const LONDON = 'Europe/London'
const LORD_HOWE = 'Australia/Lord_Howe' // DST shift is 30 minutes
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

describe('presets and goals', () => {
  it('maps each preset to its fasting hours', () => {
    expect(presetGoal('13:11').goalMs).toBe(13 * HOUR)
    expect(presetGoal('16:8').goalMs).toBe(16 * HOUR)
    expect(presetGoal('18:6').goalMs).toBe(18 * HOUR)
    expect(presetGoal('20:4').goalMs).toBe(20 * HOUR)
    expect(presetGoal('omad').goalMs).toBe(23 * HOUR)
    expect(presetGoal('36h').goalMs).toBe(36 * HOUR)
  })

  it('falls back to 16:8 for an unknown preset', () => {
    expect(presetGoal('nope')).toEqual({ presetId: '16:8', goalMs: 16 * HOUR })
  })

  it('clamps and rounds custom goals', () => {
    expect(customGoal(14.5).goalMs).toBe(14 * HOUR + 30 * MINUTE)
    expect(customGoal(0).goalMs).toBe(1 * HOUR)
    expect(customGoal(1000).goalMs).toBe(168 * HOUR)
    expect(customGoal(Number.NaN).goalMs).toBe(16 * HOUR)
    expect(customGoal(12).presetId).toBe('custom')
  })
})

describe('elapsed, remaining and progress', () => {
  const fast = startFast(presetGoal('16:8'), at('2026-06-01T20:00:00Z'))

  it('computes elapsed and remaining time', () => {
    const now = at('2026-06-02T04:00:00Z')
    expect(elapsedMs(fast, now)).toBe(8 * HOUR)
    expect(remainingMs(fast, now)).toBe(8 * HOUR)
    expect(progress(fast, now)).toBe(0.5)
  })

  it('caps progress at 1 and remaining at 0 past the goal', () => {
    const now = at('2026-06-02T20:00:00Z')
    expect(elapsedMs(fast, now)).toBe(24 * HOUR)
    expect(remainingMs(fast, now)).toBe(0)
    expect(progress(fast, now)).toBe(1)
  })

  it('never goes negative if the clock is behind the start', () => {
    const now = at('2026-06-01T19:00:00Z')
    expect(elapsedMs(fast, now)).toBe(0)
    expect(progress(fast, now)).toBe(0)
  })
})

describe('fasts that cross midnight', () => {
  it('counts elapsed time across midnight', () => {
    // 8 PM to 9:15 AM the next day in New York (summer, no DST change).
    const fast = startFast(presetGoal('16:8'), at('2026-07-14T20:00:00-04:00'))
    const now = at('2026-07-15T09:15:30-04:00')
    expect(formatClock(elapsedMs(fast, now))).toBe('13:15:30')
    expect(formatClock(remainingMs(fast, now))).toBe('02:44:30')
  })

  it('says the goal is reached tomorrow, at the right wall-clock time', () => {
    const start = at('2026-07-14T20:00:00-04:00')
    const fast = startFast(presetGoal('16:8'), start)
    expect(describeInstant(goalReachedAt(fast), start, 'en-US', NY)).toBe('tomorrow at 12:00 PM')
    // Once past midnight, the same instant is "today".
    expect(describeInstant(goalReachedAt(fast), at('2026-07-15T00:30:00-04:00'), 'en-US', NY)).toBe(
      'today at 12:00 PM',
    )
  })

  it('handles a 36h fast spanning two midnights', () => {
    const start = at('2026-07-14T19:00:00-04:00')
    const fast = startFast(presetGoal('36h'), start)
    expect(calendarDaysBetween(start, goalReachedAt(fast), NY)).toBe(2)
    expect(describeInstant(goalReachedAt(fast), start, 'en-US', NY)).toBe('Thu at 7:00 AM')
    expect(formatClock(elapsedMs(fast, at('2026-07-16T07:00:00-04:00')))).toBe('36:00:00')
  })

  it('treats one minute either side of midnight as different days', () => {
    expect(calendarDaysBetween(at('2026-07-14T23:59:00-04:00'), at('2026-07-15T00:01:00-04:00'), NY)).toBe(1)
    expect(calendarDaysBetween(at('2026-07-15T00:01:00-04:00'), at('2026-07-14T23:59:00-04:00'), NY)).toBe(-1)
  })
})

describe('DST transitions', () => {
  it('spring forward: a fast over the lost hour is an hour shorter than the wall clock suggests', () => {
    // US DST starts 2026-03-08 at 2 AM. 8 PM EST to 12 PM EDT reads as 16h on the
    // wall clock, but only 15h have actually passed.
    const fast = startFast(presetGoal('16:8'), at('2026-03-07T20:00:00-05:00'))
    const noon = at('2026-03-08T12:00:00-04:00')
    expect(elapsedMs(fast, noon)).toBe(15 * HOUR)
    expect(remainingMs(fast, noon)).toBe(1 * HOUR)
    // The 16h goal lands at 1 PM local, not noon.
    expect(time(goalReachedAt(fast), NY)).toBe('1:00 PM')
    expect(describeInstant(goalReachedAt(fast), fast.startedAt, 'en-US', NY)).toBe('tomorrow at 1:00 PM')
  })

  it('fall back: a fast over the repeated hour is an hour longer than the wall clock suggests', () => {
    // US DST ends 2026-11-01 at 2 AM. 8 PM EDT to 12 PM EST is 17h of real time.
    const fast = startFast(presetGoal('16:8'), at('2026-10-31T20:00:00-04:00'))
    const noon = at('2026-11-01T12:00:00-05:00')
    expect(elapsedMs(fast, noon)).toBe(17 * HOUR)
    expect(progress(fast, noon)).toBe(1)
    expect(time(goalReachedAt(fast), NY)).toBe('11:00 AM')
  })

  it('counts time correctly during the repeated 1 AM hour', () => {
    const fast = startFast(presetGoal('13:11'), at('2026-11-01T01:30:00-04:00')) // first 1:30 AM (EDT)
    const secondOneThirty = at('2026-11-01T01:30:00-05:00') // second 1:30 AM (EST)
    expect(time(fast.startedAt, NY)).toBe(time(secondOneThirty, NY))
    expect(elapsedMs(fast, secondOneThirty)).toBe(1 * HOUR)
  })

  it('treats 23- and 25-hour days as single calendar days', () => {
    // 00:30 to 23:30 on the 25-hour fall-back day is 24h of real time but the same date.
    const from = at('2026-11-01T00:30:00-04:00')
    const to = at('2026-11-01T23:30:00-05:00')
    expect(to - from).toBe(24 * HOUR)
    expect(calendarDaysBetween(from, to, NY)).toBe(0)
    expect(describeInstant(to, from, 'en-US', NY)).toBe('today at 11:30 PM')
    // 23:30 the night before spring forward to 00:30 the night after: 24h, but two dates on.
    expect(calendarDaysBetween(at('2026-03-07T23:30:00-05:00'), at('2026-03-09T00:30:00-04:00'), NY)).toBe(2)
  })

  it('handles the UK transition and a 30-minute DST shift', () => {
    // UK clocks go back 2026-10-25 at 2 AM BST.
    const uk = startFast(presetGoal('18:6'), at('2026-10-24T19:00:00+01:00'))
    expect(time(goalReachedAt(uk), LONDON)).toBe('12:00 PM')
    expect(elapsedMs(uk, at('2026-10-25T12:00:00+00:00'))).toBe(18 * HOUR)
    // Lord Howe Island moves from +11 to +10:30 on 2026-04-05 at 2 AM.
    const lh = startFast(presetGoal('16:8'), at('2026-04-04T20:00:00+11:00'))
    expect(time(goalReachedAt(lh), LORD_HOWE)).toBe('11:30 AM')
  })

  it('also works in the device time zone (tests run with TZ=America/New_York)', () => {
    const jan = new Date('2026-01-15T12:00:00Z').getTimezoneOffset()
    const jul = new Date('2026-07-15T12:00:00Z').getTimezoneOffset()
    expect(jan).not.toBe(jul) // guard: the test zone must observe DST
    const start = at('2026-03-07T20:00:00-05:00')
    const fast = startFast(presetGoal('16:8'), start)
    expect(calendarDaysBetween(start, goalReachedAt(fast))).toBe(1)
    expect(describeInstant(goalReachedAt(fast), start, 'en-US')).toBe('tomorrow at 1:00 PM')
  })
})

describe('time zone changes', () => {
  it('elapsed time does not depend on the zone the fast is viewed in', () => {
    const fast = startFast(presetGoal('20:4'), at('2026-05-10T18:00:00-07:00')) // started in Los Angeles
    const now = at('2026-05-11T08:00:00+01:00') // checked in London
    expect(elapsedMs(fast, now)).toBe(6 * HOUR)
    expect(describeInstant(goalReachedAt(fast), now, 'en-US', LONDON)).toBe('today at 10:00 PM')
  })
})

describe('formatting', () => {
  it('splits durations without wrapping hours at 24', () => {
    expect(splitDuration(36 * HOUR + 5 * MINUTE + 9000)).toEqual({ hours: 36, minutes: 5, seconds: 9 })
    expect(formatClock(0)).toBe('00:00:00')
    expect(formatClock(-5000)).toBe('00:00:00')
    expect(formatClock(100 * HOUR + 999)).toBe('100:00:00')
  })

  it('formats goals', () => {
    expect(formatGoal(16 * HOUR)).toBe('16h')
    expect(formatGoal(14 * HOUR + 30 * MINUTE)).toBe('14h 30m')
    expect(formatGoal(45 * MINUTE)).toBe('45m')
  })
})

describe('persistence', () => {
  it('an active fast survives a reload with the correct elapsed time', () => {
    const store = memoryStore()
    const fast = startFast(presetGoal('18:6'), at('2026-11-01T00:30:00-04:00'))
    saveActiveFast(store, fast)
    // "Reload": read it back later, across the fall-back hour.
    const restored = loadActiveFast(store)
    expect(restored).toEqual(fast)
    expect(elapsedMs(restored!, at('2026-11-01T09:30:00-05:00'))).toBe(10 * HOUR)
  })

  it('clears the active fast', () => {
    const store = memoryStore()
    saveActiveFast(store, startFast(presetGoal('16:8'), 0))
    saveActiveFast(store, null)
    expect(loadActiveFast(store)).toBeNull()
  })

  it('ignores missing or corrupt data', () => {
    const store = memoryStore()
    expect(loadActiveFast(store)).toBeNull()
    store.setItem(ACTIVE_KEY, '{not json')
    expect(loadActiveFast(store)).toBeNull()
    store.setItem(ACTIVE_KEY, JSON.stringify({ presetId: '16:8', goalMs: 'x', startedAt: 1 }))
    expect(loadActiveFast(store)).toBeNull()
    store.setItem(ACTIVE_KEY, JSON.stringify({ presetId: '16:8', goalMs: HOUR }))
    expect(loadActiveFast(store)).toBeNull()
  })

  it('remembers the chosen goal, defaulting to 16:8', () => {
    const store = memoryStore()
    expect(loadGoal(store)).toEqual(presetGoal('16:8'))
    saveGoal(store, customGoal(14))
    expect(loadGoal(store)).toEqual({ presetId: 'custom', goalMs: 14 * HOUR })
  })
})
