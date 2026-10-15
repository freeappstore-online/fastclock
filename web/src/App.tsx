import { useEffect, useState } from 'react'
import { initApp } from '@freeappstore/sdk'
import { BuildInfo, type NavItem, PageHeader, Shell } from '@freeappstore/sdk/ui'
import Timer from './Timer'

const fas = initApp({ appId: 'fastclock' })

// The app's screens. Shell renders them as its navbar (<nav aria-label="Main">,
// current screen highlighted, a menu on phones). `title` becomes the browser
// tab title on that route.
const NAV: NavItem[] = [
  { label: 'Timer', href: '/', title: 'FastClock' },
  { label: 'About', href: '/about', title: 'About — FastClock' },
]

// The features still to come in v1 (freeappstore-online/platform#203).
const FEATURES = [
  { name: 'History', what: 'Calendar, streak, average and longest fast, and a weekly chart.' },
  { name: 'Backup', what: 'Export your data any time. Everything stays on your device; no account.' },
]

export default function App() {
  const [path, setPath] = useState(() => window.location.pathname)

  // Keep the screen in step with the browser's back and forward buttons.
  useEffect(() => {
    const sync = () => setPath(window.location.pathname)
    window.addEventListener('popstate', sync)
    return () => window.removeEventListener('popstate', sync)
  }, [])

  // Nav clicks switch screens without a page load. Shell scrolls to the top
  // and moves focus to the new screen's PageHeader.
  const navigate = (href: string) => {
    window.history.pushState(null, '', href)
    setPath(href)
  }

  return (
    <Shell app={fas} appName="FastClock" nav={NAV} onNavigate={navigate}>
      <div className="mx-auto w-full max-w-3xl p-4 sm:p-8">
        {path === '/about' ? (
          <About />
        ) : (
          <>
            <Timer />
            <ComingNext />
          </>
        )}
      </div>
      <BuildInfo />
    </Shell>
  )
}

// Features that aren't built yet, labelled plainly as upcoming.
function ComingNext() {
  return (
    <section aria-labelledby="next-heading" className="mt-10">
      <h2 id="next-heading" className="mb-3 font-semibold text-[var(--ink)]">
        Coming next
      </h2>
      <ul className="grid gap-3 sm:grid-cols-2">
        {FEATURES.map((feature) => (
          <li key={feature.name} className="rounded-[var(--radius)] border border-[var(--line)] p-4">
            <p className="font-semibold text-[var(--ink)]">{feature.name}</p>
            <p className="text-sm text-[var(--muted)]">{feature.what}</p>
          </li>
        ))}
      </ul>
    </section>
  )
}

function About() {
  return (
    <>
      <PageHeader title="About" />
      <p className="text-[var(--muted)]">
        FastClock is a simple, free timer for intermittent fasting: pick a goal, start a fast, and
        watch the clock. Your fast is saved on your device, so it keeps running if you close the
        page. There's no account, no subscription and no ads. History and streaks are on the way.
        FastClock offers general information only, not medical advice.
      </p>
      <p className="mt-4 text-[var(--muted)]">
        FastClock is a free, MIT-licensed app on{' '}
        <a href="https://freeappstore.online" className="underline">
          FreeAppStore
        </a>
        .
      </p>
    </>
  )
}
