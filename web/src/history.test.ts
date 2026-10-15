import { describe, expect, it } from 'vitest'
import type { FastRecord } from './types'
import { HOUR, deleteFast, loadFasts, saveFasts } from './fast'
import {
  averageLength,
  calendarMarks,
  currentStreak,
  dailyTotals,
  dayKey,
  goalMet,
  longestFast,
  monthGrid,
  newestFirst,
  startOfDay,
} from './history'

// Tests run with TZ=America/New_York (see vitest.config.ts).
const at = (iso: string) => new Date(iso).getTime()
const rec = (id: string, start: string, end: string, goalHours = 16): FastRecord => ({
  id,
  startMs: at(start),
  endMs: at(end),
  goalMs: goalHours * HOUR,
})

function memoryStore() {
  const data = new Map<string, string>()
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
  }
}

// Fasts over both 2026 US DST changes, each 8 PM to noon local.
const SPRING = rec('spring', '2026-03-07T20:00:00-05:00', '2026-03-08T12:00:00-04:00') // 15h real
const FALL = rec('fall', '2026-10-31T20:00:00-04:00', '2026-11-01T12:00:00-05:00') // 17h real
const PLAIN = rec('plain', '2026-07-14T20:00:00-04:00', '2026-07-15T12:00:00-04:00') // 16h

describe('guard', () => {
  it('runs in a DST-observing zone', () => {
    expect(new Date(at('2026-01-15T12:00:00Z')).getTimezoneOffset()).not.toBe(
      new Date(at('2026-07-15T12:00:00Z')).getTimezoneOffset(),
    )
  })
})

describe('local days', () => {
  it('finds local midnight and steps whole days across DST', () => {
    const noon = at('2026-03-08T12:00:00-04:00')
    expect(startOfDay(noon)).toBe(at('2026-03-08T00:00:00-05:00'))
    expect(startOfDay(noon, 1)).toBe(at('2026-03-09T00:00:00-04:00'))
    expect(startOfDay(noon, 1) - startOfDay(noon)).toBe(23 * HOUR)
    expect(startOfDay(at('2026-11-01T12:00:00-05:00'), 1) - startOfDay(at('2026-11-01T12:00:00-05:00'))).toBe(
      25 * HOUR,
    )
    expect(dayKey(at('2026-10-31T23:59:00-04:00'))).toBe('2026-10-31')
    expect(dayKey(at('2026-11-01T00:01:00-04:00'))).toBe('2026-11-01')
  })
})

describe('goal met, average and longest', () => {
  it('uses real elapsed time, not wall-clock time, across DST', () => {
    expect(goalMet(SPRING)).toBe(false) // 15h of a 16h goal, though the clock says 8 PM to noon
    expect(goalMet(FALL)).toBe(true)
    expect(goalMet(PLAIN)).toBe(true)
    expect(averageLength([SPRING, FALL, PLAIN])).toBe(16 * HOUR)
    expect(longestFast([SPRING, PLAIN, FALL])).toBe(FALL)
  })

  it('handles empty history', () => {
    expect(averageLength([])).toBeNull()
    expect(longestFast([])).toBeNull()
    expect(currentStreak([], at('2026-07-15T12:00:00-04:00'))).toBe(0)
  })

  it('lists newest first', () => {
    expect(newestFirst([SPRING, FALL, PLAIN]).map((f) => f.id)).toEqual(['fall', 'plain', 'spring'])
  })
})

describe('current streak', () => {
  // Three 16h fasts ending at noon on Jul 13, 14 and 15, each crossing midnight.
  const week = [
    rec('a', '2026-07-12T20:00:00-04:00', '2026-07-13T12:00:00-04:00'),
    rec('b', '2026-07-13T20:00:00-04:00', '2026-07-14T12:00:00-04:00'),
    rec('c', '2026-07-14T20:00:00-04:00', '2026-07-15T12:00:00-04:00'),
  ]

  it('counts today when a fast has ended today', () => {
    expect(currentStreak(week, at('2026-07-15T18:00:00-04:00'))).toBe(3)
  })

  it('counts from yesterday while today has no finished fast yet', () => {
    expect(currentStreak(week, at('2026-07-16T09:00:00-04:00'))).toBe(3)
  })

  it('resets after a missed day', () => {
    expect(currentStreak(week, at('2026-07-17T09:00:00-04:00'))).toBe(0)
  })

  it('counts a fast spanning midnight on the day it ended', () => {
    // Ended at 12:30 AM on Jul 16, so Jul 16 counts, not Jul 15 twice.
    const late = rec('d', '2026-07-15T08:00:00-04:00', '2026-07-16T00:30:00-04:00')
    expect(currentStreak([...week, late], at('2026-07-16T09:00:00-04:00'))).toBe(4)
  })

  it('ignores fasts that missed their goal, and counts several in a day once', () => {
    const short = rec('s', '2026-07-15T13:00:00-04:00', '2026-07-15T15:00:00-04:00')
    const missed = [week[0], { ...week[1], goalMs: 20 * HOUR }, week[2], short]
    expect(currentStreak(missed, at('2026-07-15T18:00:00-04:00'))).toBe(1)
  })

  it('steps over the 23-hour spring-forward day', () => {
    // Fasts ending Mar 7, 8 and 9. Just after midnight on Mar 9, "now - 24h" would land on
    // Mar 7 and skip Mar 8; stepping by calendar day does not.
    const fasts = [
      rec('m7', '2026-03-06T20:00:00-05:00', '2026-03-07T12:00:00-05:00'),
      rec('m8', '2026-03-07T06:00:00-05:00', '2026-03-08T12:00:00-04:00'),
      rec('m9', '2026-03-08T08:00:00-04:00', '2026-03-09T00:15:00-04:00'),
    ]
    expect(currentStreak(fasts, at('2026-03-09T00:30:00-04:00'))).toBe(3)
  })

  it('steps over the 25-hour fall-back day', () => {
    const fasts = [
      rec('o31', '2026-10-30T20:00:00-04:00', '2026-10-31T12:00:00-04:00'),
      rec('n1', '2026-10-31T20:00:00-04:00', '2026-11-01T23:30:00-05:00'),
      rec('n2', '2026-11-01T23:45:00-05:00', '2026-11-02T23:00:00-05:00'),
    ]
    expect(currentStreak(fasts, at('2026-11-02T23:30:00-05:00'))).toBe(3)
  })
})

describe('daily totals (weekly chart)', () => {
  it('splits a fast across midnight', () => {
    const totals = dailyTotals([PLAIN], at('2026-07-15T18:00:00-04:00'))
    expect(totals).toHaveLength(7)
    expect(totals.map((t) => t.key)).toEqual([
      '2026-07-09',
      '2026-07-10',
      '2026-07-11',
      '2026-07-12',
      '2026-07-13',
      '2026-07-14',
      '2026-07-15',
    ])
    expect(totals[5].ms).toBe(4 * HOUR)
    expect(totals[6].ms).toBe(12 * HOUR)
    expect(totals.reduce((s, t) => s + t.ms, 0)).toBe(16 * HOUR)
  })

  it('splits correctly across spring-forward (midnight to noon is 11 hours)', () => {
    const totals = dailyTotals([SPRING], at('2026-03-10T12:00:00-04:00'))
    expect(totals.map((t) => t.key)).toEqual([
      '2026-03-04',
      '2026-03-05',
      '2026-03-06',
      '2026-03-07',
      '2026-03-08',
      '2026-03-09',
      '2026-03-10',
    ])
    expect(totals[3].ms).toBe(4 * HOUR)
    expect(totals[4].ms).toBe(11 * HOUR)
  })

  it('splits correctly across fall-back (midnight to noon is 13 hours)', () => {
    const totals = dailyTotals([FALL], at('2026-11-01T18:00:00-05:00'))
    expect(totals[5]).toMatchObject({ key: '2026-10-31', ms: 4 * HOUR })
    expect(totals[6]).toMatchObject({ key: '2026-11-01', ms: 13 * HOUR })
  })

  it('includes the running fast up to now and ignores fasts outside the week', () => {
    const now = at('2026-07-22T09:00:00-04:00')
    const totals = dailyTotals([PLAIN], now, 7, { startedAt: at('2026-07-21T21:00:00-04:00') })
    expect(totals[5]).toMatchObject({ key: '2026-07-21', ms: 3 * HOUR })
    expect(totals[6]).toMatchObject({ key: '2026-07-22', ms: 9 * HOUR })
    expect(totals.slice(0, 5).every((t) => t.ms === 0)).toBe(true)
  })
})

describe('calendar', () => {
  it('marks the day a fast ended, and whether any fast that day met its goal', () => {
    const marks = calendarMarks([SPRING, FALL, rec('x', '2026-11-01T13:00:00-05:00', '2026-11-01T14:00:00-05:00')])
    expect(marks.get('2026-03-08')).toEqual({ count: 1, goalMet: false })
    expect(marks.get('2026-11-01')).toEqual({ count: 2, goalMet: true })
    expect(marks.has('2026-10-31')).toBe(false)
  })

  it('lays out a month starting on Monday, with every day once, across DST', () => {
    const weeks = monthGrid(2026, 10) // November 2026 starts on a Sunday
    expect(weeks[0].slice(0, 6)).toEqual([null, null, null, null, null, null])
    const days = weeks.flat().filter((d): d is number => d !== null)
    expect(days.map((d) => new Date(d).getDate())).toEqual(Array.from({ length: 30 }, (_, i) => i + 1))
    expect(days.every((d) => startOfDay(d) === d)).toBe(true)
    expect(weeks.every((w) => w.length === 7)).toBe(true)
    expect(monthGrid(2026, 9)[0].indexOf(at('2026-10-01T00:00:00-04:00'))).toBe(3) // Oct 1 is a Thursday
  })
})

describe('persistence', () => {
  it('history and stats survive a reload', () => {
    const store = memoryStore()
    saveFasts(store, [SPRING, FALL, PLAIN])
    const reloaded = loadFasts(store)
    expect(newestFirst(reloaded)).toEqual(newestFirst([SPRING, FALL, PLAIN]))
    expect(averageLength(reloaded)).toBe(16 * HOUR)
    expect(longestFast(reloaded)?.id).toBe('fall')
  })

  it('deletes a fast and persists the deletion', () => {
    const store = memoryStore()
    saveFasts(store, [SPRING, FALL, PLAIN])
    expect(deleteFast(store, 'fall')).toBe(true)
    expect(loadFasts(store).map((f) => f.id)).toEqual(['spring', 'plain'])
    expect(deleteFast(store, 'fall')).toBe(false)
    expect(longestFast(loadFasts(store))?.id).toBe('plain')
  })
})
