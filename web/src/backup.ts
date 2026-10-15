// Backups as one JSON file, and erasing everything. All local; nothing here
// touches the network.

import type { FastRecord } from './types'
import {
  ACTIVE_KEY,
  type ActiveFast,
  FASTS_KEY,
  GOAL_KEY,
  type Goal,
  type KeyValueStore,
  isActiveFast,
  isFastRecord,
  isGoal,
  loadActiveFast,
  loadFasts,
  loadGoal,
  saveActiveFast,
  saveFasts,
  saveGoal,
} from './fast'

export const BACKUP_FORMAT = 'fastclock-backup'
export const BACKUP_VERSION = 1

/** Everything FastClock keeps. */
export interface BackupData {
  /** Completed fasts. */
  fasts: FastRecord[]
  /** The fast running at export time, if any. */
  active: ActiveFast | null
  /** The chosen goal (preset or custom). */
  goal: Goal
}

export interface Backup extends BackupData {
  format: typeof BACKUP_FORMAT
  version: number
  exportedAt: string
}

export function makeBackup(store: KeyValueStore, now: number): Backup {
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: new Date(now).toISOString(),
    fasts: loadFasts(store),
    active: loadActiveFast(store),
    goal: loadGoal(store),
  }
}

export function backupFileName(now: number): string {
  return `fastclock-backup-${new Date(now).toISOString().slice(0, 10)}.json`
}

export class BackupError extends Error {}

/**
 * Read a backup file's text. All or nothing: throws BackupError, with a
 * message fit to show the user, if anything in it is missing or damaged.
 */
export function parseBackup(text: string): BackupData {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    throw new BackupError("That file isn't a FastClock backup (it isn't valid JSON).")
  }
  const b = data as Partial<Backup> | null
  if (typeof b !== 'object' || b === null || b.format !== BACKUP_FORMAT || !Array.isArray(b.fasts)) {
    throw new BackupError("That file isn't a FastClock backup.")
  }
  if (typeof b.version !== 'number' || b.version > BACKUP_VERSION) {
    throw new BackupError('That backup was made by a newer version of FastClock. Reload the app and try again.')
  }
  if (!b.fasts.every(isFastRecord)) {
    throw new BackupError('Some fasts in that backup are damaged, so nothing was restored.')
  }
  if (new Set(b.fasts.map((f) => f.id)).size !== b.fasts.length) {
    throw new BackupError('That backup lists the same fast twice, so nothing was restored.')
  }
  if (b.active != null && !isActiveFast(b.active)) {
    throw new BackupError('The running fast in that backup is damaged, so nothing was restored.')
  }
  if (!isGoal(b.goal)) {
    throw new BackupError('The goal in that backup is damaged, so nothing was restored.')
  }
  return {
    fasts: b.fasts.map(({ id, startMs, endMs, goalMs }) => ({ id, startMs, endMs, goalMs })),
    active: b.active ? { presetId: b.active.presetId, goalMs: b.active.goalMs, startedAt: b.active.startedAt } : null,
    goal: { presetId: b.goal.presetId, goalMs: b.goal.goalMs },
  }
}

/** Replace everything on this device with a backup's contents. */
export function restoreBackup(store: KeyValueStore, data: BackupData): void {
  saveFasts(store, data.fasts)
  saveActiveFast(store, data.active)
  saveGoal(store, data.goal)
}

/** Remove everything FastClock keeps in this browser. */
export function eraseAll(store: KeyValueStore): void {
  for (const key of [FASTS_KEY, ACTIVE_KEY, GOAL_KEY]) store.removeItem(key)
}
