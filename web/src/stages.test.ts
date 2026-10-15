import { describe, expect, it } from 'vitest'
import { HOUR, MINUTE, elapsedMs, presetGoal, startFast } from './fast'
import { STAGES, STAGES_DISCLAIMER, msUntilNextStage, stageIndexAt, stageProgress } from './stages'

const at = (iso: string) => new Date(iso).getTime()
const idAt = (ms: number) => STAGES[stageIndexAt(ms)].id

describe('stages', () => {
  it('start at zero, in increasing order', () => {
    expect(STAGES[0].fromHours).toBe(0)
    for (let i = 1; i < STAGES.length; i++) expect(STAGES[i].fromHours).toBeGreaterThan(STAGES[i - 1].fromHours)
  })

  it('finds the stage for elapsed time, switching exactly at each boundary', () => {
    expect(idAt(0)).toBe('fed')
    expect(idAt(4 * HOUR - 1)).toBe('fed')
    expect(idAt(4 * HOUR)).toBe('post-absorptive')
    expect(idAt(12 * HOUR)).toBe('fasting')
    expect(idAt(17 * HOUR + 59 * MINUTE)).toBe('fasting')
    expect(idAt(18 * HOUR)).toBe('extended')
    expect(idAt(36 * HOUR)).toBe('long')
  })

  it('reports progress through a stage and time to the next', () => {
    expect(stageProgress(stageIndexAt(8 * HOUR), 8 * HOUR)).toBe(0.5)
    expect(msUntilNextStage(8 * HOUR)).toBe(4 * HOUR)
    expect(stageProgress(stageIndexAt(30 * HOUR), 30 * HOUR)).toBe(1)
    expect(msUntilNextStage(30 * HOUR)).toBeNull()
  })

  it('tracks an active fast by real elapsed time across DST', () => {
    // 8 PM EST to 8 AM EDT on spring-forward night: 11 real hours, still post-absorptive.
    const fast = startFast(presetGoal('16:8'), at('2026-03-07T20:00:00-05:00'))
    expect(idAt(elapsedMs(fast, at('2026-03-08T08:00:00-04:00')))).toBe('post-absorptive')
    expect(idAt(elapsedMs(fast, at('2026-03-08T09:00:00-04:00')))).toBe('fasting')
  })
})

// Acceptance for #207: no medical or weight-loss claims anywhere in the copy.
const CLAIMS =
  /\b(weight|lose|losing|slim|fat|burn|calori|ketosis|ketone|autophag|detox|cleans|insulin|glucose|blood sugar|hormone|metaboli|longevity|heal(?:s|ing|ed)?\b|cure|immun|inflammat|repair|regenerat|anti-?aging|boost|benefit)/i

describe('copy has no medical or weight-loss claims', () => {
  it('in the stages and disclaimer', () => {
    for (const s of STAGES) {
      expect(s.name).not.toMatch(CLAIMS)
      expect(s.description).not.toMatch(CLAIMS)
    }
    expect(STAGES_DISCLAIMER).not.toMatch(CLAIMS)
    expect(STAGES_DISCLAIMER).toMatch(/not medical advice/)
  })

  it('in any screen', () => {
    const sources = import.meta.glob(['./*.tsx', '../index.html', '../public/manifest.json'], {
      query: '?raw',
      import: 'default',
      eager: true,
    })
    expect(Object.keys(sources).length).toBeGreaterThan(2)
    for (const [file, text] of Object.entries(sources)) {
      const match = (text as string).match(CLAIMS)
      expect(match?.[0], `${file} mentions "${match?.[0]}"`).toBeUndefined()
    }
  })
})
