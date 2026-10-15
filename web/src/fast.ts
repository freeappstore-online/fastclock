import type { FastRecord } from './types'

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

// ---------------------------------------------------------------------------
// Completed fasts, editing, and the eating window.

export const FASTS_KEY = 'fastclock.fasts'

function isFastRecord(value: unknown): value is FastRecord {
  if (typeof value !== 'object' || value === null) return false
  const v = value as Record<string, unknown>
  return (
    typeof v.id === 'string' &&
    [v.startMs, v.endMs, v.goalMs].every((n) => typeof n === 'number' && Number.isFinite(n)) &&
    (v.endMs as number) > (v.startMs as number)
  )
}

/** Completed fasts, oldest first. */
export function loadFasts(store: KeyValueStore): FastRecord[] {
  const value = readJson(store, FASTS_KEY)
  if (!Array.isArray(value)) return []
  return value
    .filter(isFastRecord)
    .map(({ id, startMs, endMs, goalMs }) => ({ id, startMs, endMs, goalMs }))
    .sort((a, b) => a.startMs - b.startMs)
}

export function saveFasts(store: KeyValueStore, fasts: FastRecord[]): void {
  store.setItem(FASTS_KEY, JSON.stringify([...fasts].sort((a, b) => a.startMs - b.startMs)))
}

/** The most recently ended fast, if any. */
export function lastFast(fasts: FastRecord[]): FastRecord | null {
  return fasts.reduce<FastRecord | null>((last, f) => (!last || f.endMs > last.endMs ? f : last), null)
}

/** Fasts shorter than this are treated as accidental taps and not recorded. */
export const MIN_RECORDED_MS = MINUTE

/** End the running fast: record it (unless it was an accidental tap) and clear it. */
export function endFast(store: KeyValueStore, fast: ActiveFast, now: number): FastRecord | null {
  saveActiveFast(store, null)
  if (now - fast.startedAt < MIN_RECORDED_MS) return null
  const record: FastRecord = { id: crypto.randomUUID(), startMs: fast.startedAt, endMs: now, goalMs: fast.goalMs }
  saveFasts(store, [...loadFasts(store), record])
  return record
}

const overlaps = (aStart: number, aEnd: number, bStart: number, bEnd: number) => aStart < bEnd && bStart < aEnd

/**
 * Check a completed fast's times against the rules. `others` are the other
 * completed fasts; `active` is the running fast, if any. Returns an error
 * message, or null if the times are valid.
 */
export function validateFastTimes(
  startMs: number,
  endMs: number,
  now: number,
  others: FastRecord[],
  active: ActiveFast | null,
): string | null {
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return 'Enter both a start and an end time.'
  if (endMs <= startMs) return 'The end time must be after the start time.'
  if (endMs > now) return "The end time can't be in the future."
  const clash = others.find((f) => overlaps(startMs, endMs, f.startMs, f.endMs))
  if (clash) return `These times overlap another fast (${describeInstant(clash.startMs, now)}).`
  if (active && endMs > active.startedAt) return 'These times overlap your current fast.'
  return null
}

/** Delete a completed fast. Returns false if it no longer exists. */
export function deleteFast(store: KeyValueStore, id: string): boolean {
  const fasts = loadFasts(store)
  const remaining = fasts.filter((f) => f.id !== id)
  if (remaining.length === fasts.length) return false
  saveFasts(store, remaining)
  return true
}

/** Edit a completed fast. Returns an error message, or null once the change is saved. */
export function editFast(
  store: KeyValueStore,
  id: string,
  patch: { startMs?: number; endMs?: number },
  now: number,
): string | null {
  const fasts = loadFasts(store)
  const target = fasts.find((f) => f.id === id)
  if (!target) return 'That fast no longer exists.'
  const startMs = patch.startMs ?? target.startMs
  const endMs = patch.endMs ?? target.endMs
  const others = fasts.filter((f) => f.id !== id)
  const error = validateFastTimes(startMs, endMs, now, others, loadActiveFast(store))
  if (error) return error
  saveFasts(store, [...others, { ...target, startMs, endMs }])
  return null
}

/** Move the running fast's start time. Returns an error message, or null once saved. */
export function editActiveFastStart(store: KeyValueStore, newStartMs: number, now: number): string | null {
  const active = loadActiveFast(store)
  if (!active) return 'There is no fast running.'
  if (!Number.isFinite(newStartMs)) return 'Enter a start time.'
  if (newStartMs > now) return "The start time can't be in the future."
  const last = lastFast(loadFasts(store))
  if (last && newStartMs < last.endMs)
    return `The start time must be after your last fast ended (${describeInstant(last.endMs, now)}).`
  saveActiveFast(store, { ...active, startedAt: newStartMs })
  return null
}

const DAY_MS = 24 * HOUR

/**
 * The eating window that follows a fast with this goal: the rest of a 24-hour
 * cycle (16h → 8h, OMAD 23h → 1h), or of a multi-day cycle for long fasts
 * (36h → 12h, so the next fast starts at the same time two days later).
 */
export function eatingWindowMs(goalMs: number): number {
  const cycle = Math.floor(goalMs / DAY_MS + 1) * DAY_MS
  return cycle - goalMs
}

/** When the next planned fast starts. Pure ms arithmetic, so DST can't shift it. */
export function nextFastAt(last: FastRecord, goalMs: number): number {
  return last.endMs + eatingWindowMs(goalMs)
}

/** Milliseconds until the next planned fast starts, or 0 if that time has passed. */
export function eatingWindowCountdown(last: FastRecord, goalMs: number, now: number): number {
  return Math.max(0, nextFastAt(last, goalMs) - now)
}

// ---------------------------------------------------------------------------
// <input type="datetime-local"> values are local wall-clock times.

/** Epoch ms → "2026-10-31T20:00" in the device's time zone. */
export function toLocalInput(instant: number): string {
  const d = new Date(instant)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** "2026-10-31T20:00" (device time zone) → epoch ms, or NaN if empty or invalid. */
export function fromLocalInput(value: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(value)
  if (!m) return Number.NaN
  const [, y, mo, d, h, mi] = m.map(Number)
  return new Date(y, mo - 1, d, h, mi).getTime()
}
