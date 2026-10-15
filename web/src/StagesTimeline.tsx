import { type ActiveFast, elapsedMs, formatClock } from './fast'
import { STAGES, STAGES_DISCLAIMER, msUntilNextStage, stageIndexAt, stageProgress } from './stages'

// A vertical timeline of general fasting stages. While a fast runs, the current
// stage is highlighted with a progress bar; earlier stages are marked as passed.
export default function StagesTimeline({ fast, now }: { fast: ActiveFast | null; now: number }) {
  const elapsed = fast ? elapsedMs(fast, now) : 0
  const current = fast ? stageIndexAt(elapsed) : -1
  const untilNext = fast ? msUntilNextStage(elapsed) : null

  return (
    <section aria-labelledby="stages-heading" className="mt-8">
      <h2 id="stages-heading" className="mb-1 font-semibold text-[var(--ink)]">
        Fasting stages
      </h2>
      <p className="mb-4 text-sm text-[var(--muted)]">
        {fast
          ? `You're in the ${STAGES[current].name.toLowerCase()} stage.${
              untilNext !== null ? ` Next stage in ${formatClock(untilNext)}.` : ''
            }`
          : 'Start a fast to see where you are on the timeline.'}
      </p>
      <ol className="flex flex-col">
        {STAGES.map((stage, i) => {
          const isCurrent = i === current
          const passed = i < current
          const next = STAGES[i + 1]
          return (
            <li
              key={stage.id}
              aria-current={isCurrent ? 'step' : undefined}
              className="relative flex gap-3 pb-4 last:pb-0"
            >
              {/* Dot and connecting line. */}
              <div className="flex flex-col items-center" aria-hidden="true">
                <span
                  className={`mt-1 h-4 w-4 shrink-0 rounded-full border-2 ${
                    isCurrent
                      ? 'border-[var(--accent)] bg-[var(--accent)] ring-4 ring-[var(--accent-soft)]'
                      : passed
                        ? 'border-[var(--accent)] bg-[var(--accent)]'
                        : 'border-[var(--line-strong)] bg-[var(--paper)]'
                  }`}
                />
                {next && (
                  <span className={`mt-1 w-0.5 flex-1 ${passed ? 'bg-[var(--accent)]' : 'bg-[var(--line-strong)]'}`} />
                )}
              </div>
              <div
                className={`flex-1 rounded-[var(--radius)] p-3 ${
                  isCurrent ? 'border border-[var(--accent)] bg-[var(--panel-strong)]' : ''
                }`}
              >
                <p className="flex flex-wrap items-baseline justify-between gap-x-3">
                  <span className={`font-semibold ${isCurrent || passed ? 'text-[var(--ink)]' : 'text-[var(--muted)]'}`}>
                    {stage.name}
                    {isCurrent && <span className="sr-only"> (current stage)</span>}
                  </span>
                  <span className="text-xs text-[var(--muted)] tabular-nums">
                    {next ? `${stage.fromHours}–${next.fromHours}h` : `${stage.fromHours}h+`}
                  </span>
                </p>
                <p className="text-sm text-[var(--muted)]">{stage.description}</p>
                {isCurrent && next && (
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--line-strong)]" aria-hidden="true">
                    <div
                      className="h-full rounded-full bg-[var(--accent)]"
                      style={{ width: `${stageProgress(i, elapsed) * 100}%` }}
                    />
                  </div>
                )}
              </div>
            </li>
          )
        })}
      </ol>
      <p className="mt-4 rounded-[var(--radius)] border border-[var(--line)] bg-[var(--panel)] p-3 text-sm text-[var(--muted)]">
        {STAGES_DISCLAIMER}
      </p>
    </section>
  )
}
