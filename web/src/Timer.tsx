import { type FormEvent, useEffect, useState } from 'react'
import { PageHeader } from '@freeappstore/sdk/ui'
import {
  type ActiveFast,
  CUSTOM_PRESET_ID,
  type Goal,
  HOUR,
  MAX_CUSTOM_HOURS,
  MIN_CUSTOM_HOURS,
  PRESETS,
  customGoal,
  describeInstant,
  eatingWindowCountdown,
  editActiveFastStart,
  elapsedMs,
  endFast,
  formatClock,
  formatGoal,
  fromLocalInput,
  goalReachedAt,
  lastFast,
  loadActiveFast,
  loadFasts,
  loadGoal,
  nextFastAt,
  presetGoal,
  progress,
  remainingMs,
  saveActiveFast,
  saveGoal,
  splitDuration,
  startFast,
  toLocalInput,
} from './fast'
import { ErrorText, inputClass, linkButton, solidButton, useNow } from './controls'
import { fastLength, goalMet } from './history'
import StagesTimeline from './StagesTimeline'
import type { FastRecord } from './types'

export default function Timer({ onNavigate }: { onNavigate: (href: string) => void }) {
  const [fast, setFast] = useState<ActiveFast | null>(() => loadActiveFast(localStorage))
  const [goal, setGoal] = useState<Goal>(() => fast ?? loadGoal(localStorage))
  const [fasts, setFasts] = useState<FastRecord[]>(() => loadFasts(localStorage))
  const last = lastFast(fasts)
  // Tick while fasting, and during the eating window for its countdown.
  const now = useNow(fast !== null || last !== null)

  const reload = () => {
    setFast(loadActiveFast(localStorage))
    setFasts(loadFasts(localStorage))
  }

  // Another tab started, ended or edited a fast.
  useEffect(() => {
    window.addEventListener('storage', reload)
    return () => window.removeEventListener('storage', reload)
  }, [])

  const chooseGoal = (next: Goal) => {
    setGoal(next)
    saveGoal(localStorage, next)
    // Changing the goal mid-fast keeps the original start time.
    if (fast) {
      const updated = { ...fast, ...next }
      setFast(updated)
      saveActiveFast(localStorage, updated)
    }
  }

  const toggle = () => {
    if (fast) endFast(localStorage, fast, Date.now())
    else saveActiveFast(localStorage, startFast(goal, Date.now()))
    reload()
  }

  return (
    <>
      <PageHeader title="FastClock" description="Pick a goal, start your fast, and watch the clock." />
      <section className="flex flex-col items-center gap-6 py-4">
        <Ring fast={fast} goal={goal} now={now} />
        <button
          type="button"
          onClick={toggle}
          className={`min-h-14 w-full max-w-xs rounded-full px-8 text-lg font-semibold shadow-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] ${
            fast ? 'fc-btn-ink' : 'fc-btn-primary'
          }`}
        >
          {fast ? 'End fast' : 'Start fast'}
        </button>
        {fast && <ActiveStart fast={fast} now={now} onSaved={reload} />}
        {!fast && last && <EatingWindow last={last} goal={goal} now={now} />}
      </section>
      <GoalPicker goal={goal} onChange={chooseGoal} />
      <StagesTimeline fast={fast} now={now} />
      {last && (
        <p className="mt-8 text-sm text-[var(--muted)]">
          Last fast: {formatGoal(fastLength(last))} of {formatGoal(last.goalMs)}
          {goalMet(last) ? ', goal reached' : ''}.{' '}
          <a
            href="/history"
            className={linkButton}
            onClick={(e) => {
              e.preventDefault()
              onNavigate('/history')
            }}
          >
            See history
          </a>
        </p>
      )}
    </>
  )
}

// "Started today at 8:00 PM · Edit start", opening an inline editor.
function ActiveStart({ fast, now, onSaved }: { fast: ActiveFast; now: number; onSaved: () => void }) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState('')
  const [error, setError] = useState<string | null>(null)

  if (!editing)
    return (
      <p className="text-center text-sm text-[var(--muted)]">
        Started {describeInstant(fast.startedAt, now)} ·{' '}
        <button
          type="button"
          className={linkButton}
          onClick={() => {
            setValue(toLocalInput(fast.startedAt))
            setError(null)
            setEditing(true)
          }}
        >
          Edit start
        </button>
      </p>
    )

  const save = (e: FormEvent) => {
    e.preventDefault()
    const message = editActiveFastStart(localStorage, fromLocalInput(value), Date.now())
    setError(message)
    if (!message) {
      setEditing(false)
      onSaved()
    }
  }

  return (
    <form onSubmit={save} noValidate className="flex w-full max-w-sm flex-col items-center gap-2">
      <label className="flex flex-wrap items-center justify-center gap-2 text-sm text-[var(--ink)]">
        Started at
        <input
          type="datetime-local"
          value={value}
          max={toLocalInput(now)}
          onChange={(e) => setValue(e.target.value)}
          aria-invalid={error !== null}
          aria-describedby="active-start-error"
          className={inputClass}
          autoFocus
        />
      </label>
      <ErrorText id="active-start-error" message={error} />
      <div className="flex gap-2">
        <button type="submit" className={solidButton}>
          Save
        </button>
        <button type="button" className={linkButton} onClick={() => setEditing(false)}>
          Cancel
        </button>
      </div>
    </form>
  )
}

// After a fast ends: a countdown to the next planned fast for the chosen goal.
function EatingWindow({ last, goal, now }: { last: FastRecord; goal: Goal; now: number }) {
  const left = eatingWindowCountdown(last, goal.goalMs, now)
  return (
    <div className="w-full max-w-sm rounded-[var(--radius)] border border-[var(--line)] bg-[var(--panel)] p-4 text-center">
      {left > 0 ? (
        <>
          <p className="text-sm text-[var(--muted)]">Eating window · next fast in</p>
          <p className="font-[Fraunces] text-3xl font-semibold text-[var(--ink)] tabular-nums" role="timer">
            {formatClock(left)}
          </p>
          <p className="text-sm text-[var(--muted)]">
            Starts {describeInstant(nextFastAt(last, goal.goalMs), now)}
          </p>
        </>
      ) : (
        <p className="text-sm text-[var(--muted)]">Your eating window has ended. Start your next fast when you're ready.</p>
      )}
    </div>
  )
}

const RADIUS = 88
const CIRCUMFERENCE = 2 * Math.PI * RADIUS

function Ring({ fast, goal, now }: { fast: ActiveFast | null; goal: Goal; now: number }) {
  const elapsed = fast ? elapsedMs(fast, now) : 0
  const remaining = fast ? remainingMs(fast, now) : goal.goalMs
  const fraction = fast ? progress(fast, now) : 0
  const done = fast !== null && remaining === 0
  const { hours, minutes, seconds } = splitDuration(elapsed)

  let caption: string
  if (!fast) caption = `Goal ${formatGoal(goal.goalMs)}`
  else if (done) caption = `Goal reached · ${formatClock(elapsed - fast.goalMs)} over`
  else caption = `${formatClock(remaining)} to go`

  return (
    <div
      className="relative aspect-square w-full max-w-[18rem]"
      role="timer"
      aria-label={
        fast
          ? `Fasting for ${hours} hours ${minutes} minutes of a ${formatGoal(fast.goalMs)} goal`
          : `Not fasting. Goal ${formatGoal(goal.goalMs)}`
      }
    >
      <svg viewBox="0 0 200 200" className="h-full w-full -rotate-90" aria-hidden="true">
        <circle cx="100" cy="100" r={RADIUS} fill="none" stroke="var(--line-strong)" strokeWidth="12" />
        <circle
          cx="100"
          cy="100"
          r={RADIUS}
          fill="none"
          stroke={done ? 'var(--success)' : 'var(--accent)'}
          strokeWidth="12"
          strokeLinecap="round"
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={CIRCUMFERENCE * (1 - fraction)}
          className="transition-[stroke-dashoffset] duration-1000 ease-linear"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 px-6 text-center">
        <p className="text-xs font-semibold tracking-wide text-[var(--muted)] uppercase">
          {fast ? 'Elapsed' : 'Ready'}
        </p>
        <p className="font-[Fraunces] text-5xl font-semibold text-[var(--ink)] tabular-nums sm:text-6xl" aria-hidden="true">
          {hours}
          <span className="text-2xl text-[var(--muted)]">h</span> {String(minutes).padStart(2, '0')}
          <span className="text-2xl text-[var(--muted)]">m</span>
        </p>
        <p className="text-xl font-medium text-[var(--muted)] tabular-nums" aria-hidden="true">
          {String(seconds).padStart(2, '0')}s
        </p>
        <p className="mt-1 text-sm text-[var(--ink)] tabular-nums">{caption}</p>
        {fast && !done && (
          <p className="text-xs text-[var(--muted)]">Goal {describeInstant(goalReachedAt(fast), now)}</p>
        )}
      </div>
    </div>
  )
}

function GoalPicker({ goal, onChange }: { goal: Goal; onChange: (goal: Goal) => void }) {
  const isCustom = goal.presetId === CUSTOM_PRESET_ID
  const [hours, setHours] = useState(() => String(isCustom ? goal.goalMs / HOUR : 14))

  const applyCustom = (value: string) => {
    setHours(value)
    const n = Number(value)
    if (value.trim() !== '' && Number.isFinite(n)) onChange(customGoal(n))
  }

  const chip = (selected: boolean) =>
    `min-h-11 rounded-full border px-4 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] ${
      selected
        ? 'fc-btn-primary border-transparent'
        : 'border-[var(--line-strong)] bg-[var(--panel)] text-[var(--ink)] hover:border-[var(--accent)]'
    }`

  return (
    <section aria-labelledby="goal-heading" className="mt-6">
      <h2 id="goal-heading" className="mb-3 font-semibold text-[var(--ink)]">
        Fasting goal
      </h2>
      <div className="flex flex-wrap gap-2">
        {PRESETS.map((preset) => (
          <button
            key={preset.id}
            type="button"
            aria-pressed={goal.presetId === preset.id}
            onClick={() => onChange(presetGoal(preset.id))}
            className={chip(goal.presetId === preset.id)}
          >
            {preset.label}
          </button>
        ))}
        <button type="button" aria-pressed={isCustom} onClick={() => applyCustom(hours)} className={chip(isCustom)}>
          Custom
        </button>
      </div>
      {isCustom && (
        <label className="mt-3 flex items-center gap-2 text-sm text-[var(--ink)]">
          Hours
          <input
            type="number"
            inputMode="decimal"
            min={MIN_CUSTOM_HOURS}
            max={MAX_CUSTOM_HOURS}
            step="0.5"
            value={hours}
            onChange={(e) => applyCustom(e.target.value)}
            className="min-h-11 w-24 rounded-[var(--radius)] border border-[var(--line-strong)] bg-[var(--paper)] px-3 text-[var(--ink)]"
          />
          <span className="text-[var(--muted)]">
            ({MIN_CUSTOM_HOURS}–{MAX_CUSTOM_HOURS})
          </span>
        </label>
      )}
    </section>
  )
}
