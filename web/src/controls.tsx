import { useEffect, useState } from 'react'

// Shared bits for the Timer and History screens.

export const linkButton =
  'min-h-11 px-2 text-sm font-semibold text-[var(--accent-deep)] underline underline-offset-2 hover:text-[var(--accent)] focus-visible:outline-2 focus-visible:outline-[var(--accent)]'
export const solidButton =
  'fc-btn-primary min-h-11 rounded-full px-5 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]'
export const dangerButton =
  'min-h-11 rounded-full bg-[var(--danger)] px-5 text-sm font-semibold text-white hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--danger)]'
export const inputClass =
  'min-h-11 rounded-[var(--radius)] border border-[var(--line-strong)] bg-[var(--paper)] px-3 text-[var(--ink)]'

export function ErrorText({ id, message }: { id: string; message: string | null }) {
  return (
    <p id={id} role="alert" className="text-sm font-medium text-[var(--danger)]">
      {message}
    </p>
  )
}

// Re-render every second while `active`, and immediately when the tab
// becomes visible again (timers are throttled in background tabs).
export function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!active) return
    const tick = () => setNow(Date.now())
    tick()
    const id = window.setInterval(tick, 1000)
    document.addEventListener('visibilitychange', tick)
    return () => {
      window.clearInterval(id)
      document.removeEventListener('visibilitychange', tick)
    }
  }, [active])
  return now
}
