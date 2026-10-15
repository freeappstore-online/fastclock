import { type FormEvent, useState } from 'react'
import { deleteFast, describeInstant, editFast, formatGoal, fromLocalInput, toLocalInput } from './fast'
import { ErrorText, dangerButton, inputClass, linkButton, solidButton } from './controls'
import { fastLength, goalMet } from './history'
import type { FastRecord } from './types'

type Mode = 'view' | 'edit' | 'confirm-delete'

// One past fast: start, end, length and goal, with inline edit and delete.
export default function FastRow({ fast, now, onSaved }: { fast: FastRecord; now: number; onSaved: () => void }) {
  const [mode, setMode] = useState<Mode>('view')
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [error, setError] = useState<string | null>(null)
  const errorId = `fast-${fast.id}-error`
  const length = fastLength(fast)
  const met = goalMet(fast)
  const when = describeInstant(fast.startMs, now)

  const openEdit = () => {
    setStart(toLocalInput(fast.startMs))
    setEnd(toLocalInput(fast.endMs))
    setError(null)
    setMode('edit')
  }

  const save = (e: FormEvent) => {
    e.preventDefault()
    const message = editFast(
      localStorage,
      fast.id,
      { startMs: fromLocalInput(start), endMs: fromLocalInput(end) },
      Date.now(),
    )
    setError(message)
    if (!message) {
      setMode('view')
      onSaved()
    }
  }

  const remove = () => {
    deleteFast(localStorage, fast.id)
    onSaved()
  }

  return (
    <li className="rounded-[var(--radius)] border border-[var(--line)] p-3">
      {mode === 'edit' ? (
        <form onSubmit={save} noValidate className="flex flex-col gap-2">
          <div className="flex flex-wrap gap-3">
            <label className="flex flex-col gap-1 text-sm text-[var(--ink)]">
              Start
              <input
                type="datetime-local"
                value={start}
                max={toLocalInput(now)}
                onChange={(e) => setStart(e.target.value)}
                aria-invalid={error !== null}
                aria-describedby={errorId}
                className={inputClass}
                autoFocus
              />
            </label>
            <label className="flex flex-col gap-1 text-sm text-[var(--ink)]">
              End
              <input
                type="datetime-local"
                value={end}
                max={toLocalInput(now)}
                onChange={(e) => setEnd(e.target.value)}
                aria-invalid={error !== null}
                aria-describedby={errorId}
                className={inputClass}
              />
            </label>
          </div>
          <ErrorText id={errorId} message={error} />
          <div className="flex gap-2">
            <button type="submit" className={solidButton}>
              Save
            </button>
            <button type="button" className={linkButton} onClick={() => setMode('view')}>
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
            <div>
              <p className="font-semibold text-[var(--ink)] tabular-nums">
                {formatGoal(length)}
                <span className="font-normal text-[var(--muted)]"> of {formatGoal(fast.goalMs)} · </span>
                <span className={met ? 'text-[var(--success)]' : 'font-normal text-[var(--muted)]'}>
                  {met ? '✓ Goal met' : 'Goal not met'}
                </span>
              </p>
              <p className="text-sm text-[var(--muted)]">
                {when} → {describeInstant(fast.endMs, now)}
              </p>
            </div>
            {mode === 'view' && (
              <div className="flex">
                <button type="button" className={linkButton} onClick={openEdit} aria-label={`Edit fast started ${when}`}>
                  Edit
                </button>
                <button
                  type="button"
                  className={linkButton}
                  onClick={() => setMode('confirm-delete')}
                  aria-label={`Delete fast started ${when}`}
                >
                  Delete
                </button>
              </div>
            )}
          </div>
          {mode === 'confirm-delete' && (
            <div
              role="alertdialog"
              aria-label="Delete this fast?"
              className="mt-3 flex flex-wrap items-center gap-2 border-t border-[var(--line)] pt-3"
            >
              <p className="text-sm text-[var(--ink)]">Delete this fast? This can't be undone.</p>
              <button type="button" className={dangerButton} onClick={remove} autoFocus>
                Delete
              </button>
              <button type="button" className={linkButton} onClick={() => setMode('view')}>
                Keep
              </button>
            </div>
          )}
        </>
      )}
    </li>
  )
}
