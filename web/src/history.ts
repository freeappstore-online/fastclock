// History stats: streak, average, longest, per-day hours and calendar marks.
//
// Days are local calendar days in the device's time zone. Day boundaries come
// from the Date constructor (new Date(y, m, d)), never from adding 24 hours,
// so 23- and 25-hour DST days are handled correctly.

import type { FastRecord } from './types'

export const fastLength = (f: FastRecord) => f.endMs - f.startMs
export const goalMet = (f: FastRecord) => fastLength(f) >= f.goalMs

/** Local midnight at the start of the day containing `instant`, shifted by `offsetDays`. */
export function startOfDay(instant: number, offsetDays = 0): number {
  const d = new Date(instant)
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + offsetDays).getTime()
}

/** "2026-10-31" for the local day containing `instant`. */
export function dayKey(instant: number): string {
  const d = new Date(instant)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Completed fasts, newest first. */
export function newestFirst(fasts: FastRecord[]): FastRecord[] {
  return [...fasts].sort((a, b) => b.startMs - a.startMs)
}

/**
 * Consecutive local days, counting back from today, on which at least one
 * fast that met its goal ended. If none has ended yet today, the count starts
 * from yesterday, so a streak isn't lost before today's fast is over.
 */
export function currentStreak(fasts: FastRecord[], now: number): number {
  const days = new Set(fasts.filter(goalMet).map((f) => dayKey(f.endMs)))
  let offset = days.has(dayKey(now)) ? 0 : -1
  let streak = 0
  while (days.has(dayKey(startOfDay(now, offset)))) {
    streak++
    offset--
  }
  return streak
}

export function longestFast(fasts: FastRecord[]): FastRecord | null {
  return fasts.reduce<FastRecord | null>((best, f) => (!best || fastLength(f) > fastLength(best) ? f : best), null)
}

export function averageLength(fasts: FastRecord[]): number | null {
  if (fasts.length === 0) return null
  return fasts.reduce((sum, f) => sum + fastLength(f), 0) / fasts.length
}

export interface DayTotal {
  /** Local midnight. */
  start: number
  key: string
  /** Milliseconds of fasting within this local day. */
  ms: number
}

/**
 * Fasting time per local day for the `days` days ending today. A fast that
 * crosses midnight is split between the days it covers. An optional running
 * fast counts up to `now`.
 */
export function dailyTotals(
  fasts: FastRecord[],
  now: number,
  days = 7,
  active?: { startedAt: number } | null,
): DayTotal[] {
  const spans = fasts.map((f) => [f.startMs, f.endMs])
  if (active) spans.push([active.startedAt, now])
  const totals: DayTotal[] = []
  for (let i = days - 1; i >= 0; i--) {
    const start = startOfDay(now, -i)
    const end = startOfDay(now, -i + 1)
    const ms = spans.reduce((sum, [s, e]) => sum + Math.max(0, Math.min(e, end) - Math.max(s, start)), 0)
    totals.push({ start, key: dayKey(start), ms })
  }
  return totals
}

export interface DayMark {
  count: number
  goalMet: boolean
}

/** Calendar marks keyed by the local day each fast ended on. */
export function calendarMarks(fasts: FastRecord[]): Map<string, DayMark> {
  const marks = new Map<string, DayMark>()
  for (const f of fasts) {
    const key = dayKey(f.endMs)
    const mark = marks.get(key) ?? { count: 0, goalMet: false }
    marks.set(key, { count: mark.count + 1, goalMet: mark.goalMet || goalMet(f) })
  }
  return marks
}

/**
 * The weeks of a month for a calendar grid (weeks start on Monday). Each week
 * has 7 cells; days outside the month are null. `month` is 0-based.
 */
export function monthGrid(year: number, month: number): (number | null)[][] {
  const first = new Date(year, month, 1)
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const lead = (first.getDay() + 6) % 7 // Monday = 0
  const cells: (number | null)[] = Array.from({ length: lead }, () => null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d).getTime())
  while (cells.length % 7) cells.push(null)
  const weeks: (number | null)[][] = []
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7))
  return weeks
}
