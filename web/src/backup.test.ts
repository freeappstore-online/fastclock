import { describe, expect, it } from 'vitest'
import {
  ACTIVE_KEY,
  FASTS_KEY,
  GOAL_KEY,
  HOUR,
  customGoal,
  loadActiveFast,
  loadFasts,
  loadGoal,
  presetGoal,
  saveActiveFast,
  saveFasts,
  saveGoal,
  startFast,
} from './fast'
import { BACKUP_FORMAT, BackupError, backupFileName, eraseAll, makeBackup, parseBackup, restoreBackup } from './backup'
import type { FastRecord } from './types'

const at = (iso: string) => new Date(iso).getTime()
const NOW = at('2026-11-02T09:00:00-05:00')

function memoryStore() {
  const data = new Map<string, string>()
  return {
    data,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
  }
}

const FASTS: FastRecord[] = [
  { id: 'a', startMs: at('2026-10-31T20:00:00-04:00'), endMs: at('2026-11-01T12:00:00-05:00'), goalMs: 16 * HOUR },
  { id: 'b', startMs: at('2026-07-14T20:00:00-04:00'), endMs: at('2026-07-15T14:00:00-04:00'), goalMs: 18 * HOUR },
]

function seeded() {
  const store = memoryStore()
  saveFasts(store, FASTS)
  saveActiveFast(store, startFast(presetGoal('20:4'), at('2026-11-01T20:00:00-05:00')))
  saveGoal(store, customGoal(14.5))
  return store
}

const reject = (text: string) => {
  try {
    parseBackup(text)
  } catch (e) {
    expect(e).toBeInstanceOf(BackupError)
    return (e as Error).message
  }
  throw new Error('expected parseBackup to throw')
}

describe('export → clear → import', () => {
  it('round-trips all data through the JSON file text', () => {
    const store = seeded()
    const before = { fasts: loadFasts(store), active: loadActiveFast(store), goal: loadGoal(store) }
    const file = JSON.stringify(makeBackup(store, NOW), null, 2)

    eraseAll(store)
    expect(store.data.size).toBe(0)
    expect(loadFasts(store)).toEqual([])
    expect(loadActiveFast(store)).toBeNull()

    restoreBackup(store, parseBackup(file))
    expect({ fasts: loadFasts(store), active: loadActiveFast(store), goal: loadGoal(store) }).toEqual(before)
    expect(before.goal).toEqual({ presetId: 'custom', goalMs: 14.5 * HOUR })
    expect(before.active?.presetId).toBe('20:4')
  })

  it('round-trips an empty device with no running fast', () => {
    const store = memoryStore()
    const file = JSON.stringify(makeBackup(store, NOW))
    restoreBackup(store, parseBackup(file))
    expect(loadFasts(store)).toEqual([])
    expect(loadActiveFast(store)).toBeNull()
    expect(loadGoal(store)).toEqual(presetGoal('16:8'))
  })

  it('replaces existing data rather than merging', () => {
    const file = JSON.stringify(makeBackup(seeded(), NOW))
    const other = memoryStore()
    saveFasts(other, [{ id: 'z', startMs: 0, endMs: HOUR, goalMs: HOUR }])
    restoreBackup(other, parseBackup(file))
    expect(loadFasts(other).map((f) => f.id)).toEqual(['b', 'a'])
  })

  it('clears a running fast when the backup had none', () => {
    const store = seeded()
    const empty = JSON.stringify(makeBackup(memoryStore(), NOW))
    restoreBackup(store, parseBackup(empty))
    expect(store.data.has(ACTIVE_KEY)).toBe(false)
  })
})

describe('the backup file', () => {
  it('is labelled and dated', () => {
    const backup = makeBackup(seeded(), NOW)
    expect(backup.format).toBe(BACKUP_FORMAT)
    expect(backup.version).toBe(1)
    expect(backup.exportedAt).toBe('2026-11-02T14:00:00.000Z')
    expect(backupFileName(NOW)).toBe('fastclock-backup-2026-11-02.json')
  })
})

describe('import validation', () => {
  const good = () => makeBackup(seeded(), NOW)

  it('rejects files that are not FastClock backups', () => {
    expect(reject('not json')).toMatch(/isn't valid JSON/)
    expect(reject('null')).toBe("That file isn't a FastClock backup.")
    expect(reject(JSON.stringify({ format: 'clearday-backup', version: 1, counters: [] }))).toBe(
      "That file isn't a FastClock backup.",
    )
    expect(reject(JSON.stringify({ ...good(), fasts: 'x' }))).toBe("That file isn't a FastClock backup.")
  })

  it('rejects a backup from a newer version', () => {
    expect(reject(JSON.stringify({ ...good(), version: 2 }))).toMatch(/newer version/)
    expect(reject(JSON.stringify({ ...good(), version: '1' }))).toMatch(/newer version/)
  })

  it('rejects damaged fasts, all or nothing', () => {
    const damaged = { ...good(), fasts: [...FASTS, { id: 'c', startMs: 5, endMs: 1, goalMs: HOUR }] }
    expect(reject(JSON.stringify(damaged))).toMatch(/fasts in that backup are damaged/)
    expect(reject(JSON.stringify({ ...good(), fasts: [{ ...FASTS[0], startMs: 'x' }] }))).toMatch(/damaged/)
  })

  it('rejects duplicate fasts', () => {
    expect(reject(JSON.stringify({ ...good(), fasts: [FASTS[0], FASTS[0]] }))).toMatch(/same fast twice/)
  })

  it('rejects a damaged running fast or goal', () => {
    expect(reject(JSON.stringify({ ...good(), active: { startedAt: 1 } }))).toMatch(/running fast/)
    expect(reject(JSON.stringify({ ...good(), goal: { presetId: '16:8', goalMs: -1 } }))).toMatch(/goal/)
  })

  it('drops unknown fields', () => {
    const extra = { ...good(), fasts: [{ ...FASTS[0], note: 'hi' }], active: null }
    expect(parseBackup(JSON.stringify(extra)).fasts[0]).toEqual(FASTS[0])
  })

  it('leaves existing data untouched when a file is rejected', () => {
    const store = seeded()
    const snapshot = new Map(store.data)
    try {
      restoreBackup(store, parseBackup('{"format":"fastclock-backup","version":1,"fasts":[1]}'))
    } catch {
      // expected
    }
    expect(store.data).toEqual(snapshot)
  })
})

describe('erase', () => {
  it('removes only FastClock data', () => {
    const store = seeded()
    store.setItem('stores-theme', 'dark')
    eraseAll(store)
    expect([FASTS_KEY, ACTIVE_KEY, GOAL_KEY].some((k) => store.data.has(k))).toBe(false)
    expect(store.getItem('stores-theme')).toBe('dark')
  })
})

// Acceptance for #209: no network calls for user data. The app's own code
// makes no requests at all; the platform's page-view script is loaded by
// index.html and never sees localStorage contents.
describe('no network calls', () => {
  it('app code never calls fetch, XHR, sendBeacon or WebSocket', () => {
    const sources = import.meta.glob(['./*.ts', './*.tsx', '!./*.test.ts'], {
      query: '?raw',
      import: 'default',
      eager: true,
    })
    expect(Object.keys(sources).length).toBeGreaterThan(5)
    for (const [file, text] of Object.entries(sources)) {
      expect(text as string, file).not.toMatch(/\bfetch\s*\(|XMLHttpRequest|sendBeacon|WebSocket|EventSource/)
    }
  })
})
