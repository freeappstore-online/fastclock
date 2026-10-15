// Timer core: pure functions over absolute instants, plus localStorage persistence.
//
// Every instant is an epoch-millisecond number (UTC), and every duration is a
// plain number of milliseconds. Elapsed time is `now - startedAt`, so it is
// unaffected by DST changes, midnight, or the device switching time zone.
// Local wall-clock time only appears when formatting for display, and calendar
// days ("today", "tomorrow") are compared as local dates, never as "+24 hours".

export const SECOND = 1000
export const MINUTE = 60 * SECOND
export const HOUR = 60 * MINUTE

export interface Preset {
  id: string
  label: string
  fastHours: number
}

export const PRESETS: Preset[] = [
  { id: '13:11', label: '13:11', fastHours: 13 },
  { id: '16:8', label: '16:8', fastHours: 16 },
  { id: '18:6', label: '18:6', fastHours: 18 },
  { id: '20:4', label: '20:4', fastHours: 20 },
  { id: 'omad', label: 'OMAD 23:1', fastHours: 23 },
  { id: '36h', label: '36h', fastHours: 36 },
]

export const DEFAULT_PRESET_ID = '16:8'
export const CUSTOM_PRESET_ID = 'custom'
export const MIN_CUSTOM_HOURS = 1
export const MAX_CUSTOM_HOURS = 168

export interface Goal {
  presetId: string
  goalMs: number
}

export interface ActiveFast extends Goal {
  /** Epoch ms when the fast started. */
  startedAt: number
}

export function presetGoal(presetId: string): Goal {
  const preset = PRESETS.find((p) => p.id === presetId) ?? PRESETS.find((p) => p.id === DEFAULT_PRESET_ID)!
  return { presetId: preset.id, goalMs: preset.fastHours * HOUR }
}

/** A custom goal, clamped to 1–168 hours and rounded to the nearest minute. */
export function customGoal(hours: number): Goal {
  const safe = Number.isFinite(hours) ? hours : presetGoal(DEFAULT_PRESET_ID).goalMs / HOUR
  const clamped = Math.min(MAX_CUSTOM_HOURS, Math.max(MIN_CUSTOM_HOURS, safe))
  return { presetId: CUSTOM_PRESET_ID, goalMs: Math.round((clamped * HOUR) / MINUTE) * MINUTE }
}

export function startFast(goal: Goal, now: number): ActiveFast {
  return { ...goal, startedAt: now }
}

export function elapsedMs(fast: ActiveFast, now: number): number {
  return Math.max(0, now - fast.startedAt)
}

export function remainingMs(fast: ActiveFast, now: number): number {
  return Math.max(0, fast.goalMs - elapsedMs(fast, now))
}

/** Progress toward the goal, from 0 to 1. */
export function progress(fast: ActiveFast, now: number): number {
  if (fast.goalMs <= 0) return 1
  return Math.min(1, elapsedMs(fast, now) / fast.goalMs)
}

export function goalReachedAt(fast: ActiveFast): number {
  return fast.startedAt + fast.goalMs
}

export interface Clock {
  hours: number
  minutes: number
  seconds: number
}

/** Split a duration into whole hours (unbounded, so 36h stays 36), minutes and seconds. */
export function splitDuration(ms: number): Clock {
  const total = Math.floor(Math.max(0, ms) / SECOND)
  return { hours: Math.floor(total / 3600), minutes: Math.floor((total % 3600) / 60), seconds: total % 60 }
}

const pad = (n: number) => String(n).padStart(2, '0')

/** "16:04:09" — hours are not wrapped at 24. */
export function formatClock(ms: number): string {
  const { hours, minutes, seconds } = splitDuration(ms)
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`
}

/** "16h", "1h 30m", "45m". */
export function formatGoal(ms: number): string {
  const { hours, minutes } = splitDuration(ms)
  if (hours && minutes) return `${hours}h ${minutes}m`
  return hours ? `${hours}h` : `${minutes}m`
}

/** Local calendar date (year, month, day) of an instant in a time zone (default: the device's). */
function localDate(instant: number, timeZone?: string): { y: number; m: number; d: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  }).formatToParts(instant)
  const get = (type: string) => Number(parts.find((p) => p.type === type)!.value)
  return { y: get('year'), m: get('month'), d: get('day') }
}

/**
 * How many local calendar days `to` falls after `from` (0 = same day, 1 = the next day).
 * Compares dates, not elapsed hours, so 23- and 25-hour DST days count as one day.
 */
export function calendarDaysBetween(from: number, to: number, timeZone?: string): number {
  const a = localDate(from, timeZone)
  const b = localDate(to, timeZone)
  return Math.round((Date.UTC(b.y, b.m - 1, b.d) - Date.UTC(a.y, a.m - 1, a.d)) / (24 * HOUR))
}

/** "today at 8:00 PM", "tomorrow at 12:00 PM", "Sat at 9:30 AM", "Oct 20 at 7:00 AM". */
export function describeInstant(instant: number, now: number, locale?: string, timeZone?: string): string {
  const time = new Intl.DateTimeFormat(locale, { timeZone, hour: 'numeric', minute: '2-digit' }).format(instant)
  const days = calendarDaysBetween(now, instant, timeZone)
  let day: string
  if (days === 0) day = 'today'
  else if (days === 1) day = 'tomorrow'
  else if (days === -1) day = 'yesterday'
  else if (days > 1 && days < 7)
    day = new Intl.DateTimeFormat(locale, { timeZone, weekday: 'short' }).format(instant)
  else day = new Intl.DateTimeFormat(locale, { timeZone, month: 'short', day: 'numeric' }).format(instant)
  return `${day} at ${time}`
}

// ---------------------------------------------------------------------------
// Persistence. The active fast and the chosen goal live in localStorage so a
// running fast survives reloads; because only `startedAt` is stored, elapsed
// time after a reload is simply recomputed from the clock.

export const ACTIVE_KEY = 'fastclock.active'
export const GOAL_KEY = 'fastclock.goal'

type KeyValueStore = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

function readJson(store: KeyValueStore, key: string): unknown {
  try {
    const raw = store.getItem(key)
    return raw == null ? null : JSON.parse(raw)
  } catch {
    return null
  }
}

function isGoal(value: unknown): value is Goal {
  if (typeof value !== 'object' || value === null) return false
  const v = value as Record<string, unknown>
  return typeof v.presetId === 'string' && typeof v.goalMs === 'number' && Number.isFinite(v.goalMs) && v.goalMs > 0
}

function isActiveFast(value: unknown): value is ActiveFast {
  return isGoal(value) && typeof (value as ActiveFast).startedAt === 'number' && Number.isFinite((value as ActiveFast).startedAt)
}

export function loadActiveFast(store: KeyValueStore): ActiveFast | null {
  const value = readJson(store, ACTIVE_KEY)
  if (!isActiveFast(value)) return null
  return { presetId: value.presetId, goalMs: value.goalMs, startedAt: value.startedAt }
}

export function saveActiveFast(store: KeyValueStore, fast: ActiveFast | null): void {
  if (fast) store.setItem(ACTIVE_KEY, JSON.stringify(fast))
  else store.removeItem(ACTIVE_KEY)
}

export function loadGoal(store: KeyValueStore): Goal {
  const value = readJson(store, GOAL_KEY)
  return isGoal(value) ? { presetId: value.presetId, goalMs: value.goalMs } : presetGoal(DEFAULT_PRESET_ID)
}

export function saveGoal(store: KeyValueStore, goal: Goal): void {
  store.setItem(GOAL_KEY, JSON.stringify(goal))
}
