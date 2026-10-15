/** A completed fast. The running fast is stored separately (see ActiveFast in fast.ts). */
export interface FastRecord {
  id: string
  /** Epoch ms. */
  startMs: number
  /** Epoch ms. */
  endMs: number
  /** The goal that was set for this fast. */
  goalMs: number
}
