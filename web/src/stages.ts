// General fasting phases, by hours since the fast started. This is general
// information only: the copy describes time, never effects on the body, and
// makes no health claims (stages.test.ts scans all copy for claim words).

import { HOUR } from './fast'

export interface Stage {
  id: string
  name: string
  /** Hours since the fast started when this stage begins. */
  fromHours: number
  description: string
}

export const STAGES: Stage[] = [
  {
    id: 'fed',
    name: 'Recently ate',
    fromHours: 0,
    description: 'The first few hours after your last meal.',
  },
  {
    id: 'post-absorptive',
    name: 'Post-absorptive',
    fromHours: 4,
    description: 'Several hours since eating. This stretch is often called the post-absorptive phase.',
  },
  {
    id: 'fasting',
    name: 'Fasting',
    fromHours: 12,
    description: 'Half a day or more since eating, the range most daily fasting plans aim for.',
  },
  {
    id: 'extended',
    name: 'Extended fast',
    fromHours: 18,
    description: 'Past 18 hours, as with 18:6, 20:4 and one-meal-a-day plans.',
  },
  {
    id: 'long',
    name: 'Long fast',
    fromHours: 24,
    description:
      "More than a day since eating. Long fasts aren't right for everyone; if you're unsure, ask a health professional.",
  },
]

/** Index of the stage reached after `elapsedMs` of fasting. */
export function stageIndexAt(elapsedMs: number): number {
  let index = 0
  STAGES.forEach((stage, i) => {
    if (elapsedMs >= stage.fromHours * HOUR) index = i
  })
  return index
}

/** How far through stage `index` the fast is (0–1); the last stage has no end, so it reports 1. */
export function stageProgress(index: number, elapsedMs: number): number {
  const next = STAGES[index + 1]
  if (!next) return 1
  const from = STAGES[index].fromHours * HOUR
  const span = next.fromHours * HOUR - from
  return Math.min(1, Math.max(0, (elapsedMs - from) / span))
}

/** Milliseconds until the next stage begins, or null in the last stage. */
export function msUntilNextStage(elapsedMs: number): number | null {
  const next = STAGES[stageIndexAt(elapsedMs) + 1]
  return next ? Math.max(0, next.fromHours * HOUR - elapsedMs) : null
}

export const STAGES_DISCLAIMER =
  'These stages are general information about time since eating, not medical advice. Everyone is different. If you have a health condition, are pregnant, or take medication, talk to a health professional before fasting.'
