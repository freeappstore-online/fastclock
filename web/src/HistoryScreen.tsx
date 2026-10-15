import { useEffect, useState } from 'react'
import { PageHeader } from '@freeappstore/sdk/ui'
import { type ActiveFast, HOUR, formatGoal, loadActiveFast, loadFasts } from './fast'
import { linkButton, useNow } from './controls'
import FastRow from './FastRow'
import {
  type DayMark,
  type DayTotal,
  averageLength,
  calendarMarks,
  currentStreak,
  dailyTotals,
  dayKey,
  longestFast,
  monthGrid,
  newestFirst,
} from './history'
import type { FastRecord } from './types'

export default function HistoryScreen() {
  const [fasts, setFasts] = useState<FastRecord[]>(() => loadFasts(localStorage))
  const [active, setActive] = useState<ActiveFast | null>(() => loadActiveFast(localStorage))
  // Tick every second so a running fast's share of today's bar stays current.
  const now = useNow(true)

  const reload = () => {
    setFasts(loadFasts(localStorage))
    setActive(loadActiveFast(localStorage))
  }

  // Another tab changed the history.
  useEffect(() => {
    window.addEventListener('storage', reload)
    return () => window.removeEventListener('storage', reload)
  }, [])

  const longest = longestFast(fasts)
  const average = averageLength(fasts)
  const streak = currentStreak(fasts, now)

  return (
    <>
      <PageHeader title="History" description="Your past fasts, kept on this device." />
      <dl className="grid grid-cols-3 gap-3">
        <Stat label="Current streak" value={`${streak} ${streak === 1 ? 'day' : 'days'}`} />
        <Stat label="Average fast" value={average === null ? '—' : formatGoal(average)} />
        <Stat label="Longest fast" value={longest ? formatGoal(longest.endMs - longest.startMs) : '—'} />
      </dl>
      <p className="mt-2 text-xs text-[var(--muted)]">
        A streak counts days in a row with at least one fast that reached its goal.
      </p>
      <WeeklyChart totals={dailyTotals(fasts, now, 7, active)} />
      <Calendar marks={calendarMarks(fasts)} now={now} />
      <section aria-labelledby="list-heading" className="mt-8">
        <h2 id="list-heading" className="mb-3 font-semibold text-[var(--ink)]">
          All fasts
        </h2>
        {fasts.length === 0 ? (
          <p className="text-[var(--muted)]">No fasts yet. Finished fasts will appear here.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {newestFirst(fasts).map((f) => (
              <FastRow key={f.id} fast={f} now={now} onSaved={reload} />
            ))}
          </ul>
        )}
      </section>
    </>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[var(--radius)] border border-[var(--line)] bg-[var(--panel)] p-3">
      <dt className="text-xs text-[var(--muted)]">{label}</dt>
      <dd className="font-[Fraunces] text-2xl font-semibold text-[var(--ink)] tabular-nums">{value}</dd>
    </div>
  )
}

const weekday = (ms: number) => new Intl.DateTimeFormat(undefined, { weekday: 'short' }).format(ms)
const fullDay = (ms: number) => new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'short', day: 'numeric' }).format(ms)
const hoursText = (ms: number) => (ms === 0 ? '0h' : formatGoal(ms))

// Fasting hours per day for the last 7 days: a single-series bar chart with a
// per-bar tooltip and a table alternative.
function WeeklyChart({ totals }: { totals: DayTotal[] }) {
  const [hover, setHover] = useState<number | null>(null)
  const peakHours = Math.max(...totals.map((t) => t.ms)) / HOUR
  const tickStep = peakHours > 16 ? 8 : 4
  const maxHours = Math.max(8, Math.ceil(peakHours / tickStep) * tickStep)
  const ticks = Array.from({ length: maxHours / tickStep + 1 }, (_, i) => i * tickStep)
  const W = 320
  const H = 160
  const left = 28
  const bottom = 20
  const top = 8
  const plotH = H - bottom - top
  const slot = (W - left) / totals.length
  const barW = Math.min(28, slot - 8)
  const y = (hours: number) => top + plotH - (hours / maxHours) * plotH
  const total = totals.reduce((s, t) => s + t.ms, 0)
  const summary = `Fasting hours per day, last 7 days: ${totals
    .map((t) => `${weekday(t.start)} ${hoursText(t.ms)}`)
    .join(', ')}. Total ${hoursText(total)}.`

  return (
    <section aria-labelledby="week-heading" className="mt-8">
      <h2 id="week-heading" className="font-semibold text-[var(--ink)]">
        Fasting hours, last 7 days
      </h2>
      <p className="mb-2 text-sm text-[var(--muted)]">Total {hoursText(total)}. Fasts that cross midnight count on both days.</p>
      <figure className="relative">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={summary} onMouseLeave={() => setHover(null)}>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={left} x2={W} y1={y(t)} y2={y(t)} stroke="var(--line)" strokeWidth="1" />
              <text x={left - 6} y={y(t)} dy="0.32em" textAnchor="end" fontSize="9" fill="var(--muted)">
                {t}h
              </text>
            </g>
          ))}
          {totals.map((t, i) => {
            const hours = t.ms / HOUR
            const x = left + i * slot + (slot - barW) / 2
            const barTop = y(hours)
            const h = top + plotH - barTop
            const r = Math.min(4, h, barW / 2)
            return (
              <g key={t.key} onMouseEnter={() => setHover(i)}>
                {h > 0 && (
                  <path
                    d={`M${x},${top + plotH} V${barTop + r} Q${x},${barTop} ${x + r},${barTop} H${x + barW - r} Q${x + barW},${barTop} ${x + barW},${barTop + r} V${top + plotH} Z`}
                    fill="var(--chart-bar)"
                    opacity={hover === null || hover === i ? 1 : 0.55}
                  />
                )}
                <text x={x + barW / 2} y={H - 6} textAnchor="middle" fontSize="9" fill="var(--muted)">
                  {weekday(t.start)}
                </text>
                {/* Hit target: the whole column, larger than the bar. */}
                <rect x={left + i * slot} y={top} width={slot} height={plotH + bottom} fill="transparent" />
              </g>
            )
          })}
          <line x1={left} x2={W} y1={top + plotH} y2={top + plotH} stroke="var(--line-strong)" strokeWidth="1" />
        </svg>
        {hover !== null && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute top-0 -translate-x-1/2 rounded-[var(--radius-sm)] border border-[var(--line)] bg-[var(--panel-strong)] px-2 py-1 text-xs whitespace-nowrap text-[var(--ink)] shadow-sm"
            style={{ left: `${((left + hover * slot + slot / 2) / W) * 100}%` }}
          >
            {fullDay(totals[hover].start)}: <strong className="tabular-nums">{hoursText(totals[hover].ms)}</strong>
          </div>
        )}
      </figure>
      <details className="mt-2 text-sm">
        <summary className="min-h-11 cursor-pointer py-2 text-[var(--accent-deep)]">Show as table</summary>
        <table className="mt-1 w-full max-w-sm text-left">
          <caption className="sr-only">Fasting hours per day, last 7 days</caption>
          <thead>
            <tr className="border-b border-[var(--line)] text-[var(--muted)]">
              <th scope="col" className="py-1 font-medium">
                Day
              </th>
              <th scope="col" className="py-1 text-right font-medium">
                Fasting
              </th>
            </tr>
          </thead>
          <tbody>
            {totals.map((t) => (
              <tr key={t.key} className="border-b border-[var(--line)]">
                <th scope="row" className="py-1 font-normal text-[var(--ink)]">
                  {fullDay(t.start)}
                </th>
                <td className="py-1 text-right text-[var(--ink)] tabular-nums">{hoursText(t.ms)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </section>
  )
}

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

// Month calendar: each day a fast ended on is marked, filled when a fast that
// day reached its goal.
function Calendar({ marks, now }: { marks: Map<string, DayMark>; now: number }) {
  const today = new Date(now)
  const [month, setMonth] = useState({ y: today.getFullYear(), m: today.getMonth() })
  const shift = (delta: number) => {
    const d = new Date(month.y, month.m + delta, 1)
    setMonth({ y: d.getFullYear(), m: d.getMonth() })
  }
  const title = new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' }).format(new Date(month.y, month.m, 1))
  const todayKey = dayKey(now)
  const isCurrentMonth = month.y === today.getFullYear() && month.m === today.getMonth()

  return (
    <section aria-labelledby="calendar-heading" className="mt-8">
      <div className="mb-2 flex items-center justify-between">
        <h2 id="calendar-heading" className="font-semibold text-[var(--ink)]" aria-live="polite">
          {title}
        </h2>
        <div className="flex">
          <button type="button" className={linkButton} onClick={() => shift(-1)} aria-label="Previous month">
            ‹ Prev
          </button>
          <button
            type="button"
            className={`${linkButton} disabled:no-underline disabled:opacity-40`}
            onClick={() => shift(1)}
            disabled={isCurrentMonth}
            aria-label="Next month"
          >
            Next ›
          </button>
        </div>
      </div>
      <table className="w-full table-fixed text-center text-sm">
        <caption className="sr-only">Fasts in {title}</caption>
        <thead>
          <tr>
            {WEEKDAYS.map((d) => (
              <th key={d} scope="col" className="pb-1 text-xs font-medium text-[var(--muted)]">
                {d}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {monthGrid(month.y, month.m).map((week, wi) => (
            <tr key={wi}>
              {week.map((day, di) => {
                if (day === null) return <td key={di} />
                const key = dayKey(day)
                const mark = marks.get(key)
                const n = new Date(day).getDate()
                const label = mark
                  ? `${fullDay(day)}: ${mark.count} ${mark.count === 1 ? 'fast' : 'fasts'}, ${mark.goalMet ? 'goal met' : 'goal not met'}`
                  : `${fullDay(day)}: no fasts`
                return (
                  <td key={di} className="py-0.5">
                    <span
                      aria-label={label}
                      aria-current={key === todayKey ? 'date' : undefined}
                      className={`mx-auto flex h-9 w-9 items-center justify-center rounded-full tabular-nums ${
                        mark?.goalMet
                          ? 'bg-[var(--chart-bar)] font-semibold text-[var(--chart-bar-ink)]'
                          : mark
                            ? 'border-2 border-[var(--chart-bar)] text-[var(--ink)]'
                            : 'text-[var(--muted)]'
                      } ${key === todayKey ? 'outline-2 outline-offset-2 outline-[var(--ink)]' : ''}`}
                    >
                      {n}
                    </span>
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <ul className="mt-2 flex flex-wrap gap-4 text-xs text-[var(--muted)]" aria-label="Calendar key">
        <li className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-full bg-[var(--chart-bar)]" aria-hidden="true" /> Goal met
        </li>
        <li className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-full border-2 border-[var(--chart-bar)]" aria-hidden="true" /> Fasted, goal not met
        </li>
        <li className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-full outline-2 outline-[var(--ink)]" aria-hidden="true" /> Today
        </li>
      </ul>
    </section>
  )
}
