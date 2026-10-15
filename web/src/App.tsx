import { useEffect, useState } from 'react'
import { initApp } from '@freeappstore/sdk'
import { BuildInfo, type NavItem, PageHeader, Shell } from '@freeappstore/sdk/ui'

const fas = initApp({ appId: 'fastclock' })

// The app's screens. Shell renders them as its navbar (<nav aria-label="Main">,
// current screen highlighted, a menu on phones). `title` becomes the browser
// tab title on that route.
const NAV: NavItem[] = [
  { label: 'Timer', href: '/', title: 'FastClock' },
  { label: 'About', href: '/about', title: 'About — FastClock' },
]

// The features planned for v1 (freeappstore-online/platform#203).
const FEATURES = [
  { name: 'Timer', what: 'Start and end a fast with one button; a live ring shows progress to your goal.' },
  { name: 'Presets', what: '13:11, 16:8, 18:6, 20:4, OMAD 23:1 and 36h, or set your own.' },
  { name: 'Edit times', what: 'Fix a start or end time after the fact.' },
  { name: 'Eating window', what: 'A countdown to your next planned fast.' },
  { name: 'Stages', what: 'A gentle timeline of general fasting phases, for information only.' },
  { name: 'History', what: 'Calendar, streak, average and longest fast, and a weekly chart.' },
  { name: 'Private', what: 'Everything stays on your device. No account; export a backup any time.' },
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
      <div className="mx-auto w-full max-w-3xl p-4 sm:p-8">{path === '/about' ? <About /> : <Timer />}</div>
      <BuildInfo />
    </Shell>
  )
}

function Timer() {
  return (
    <>
      <PageHeader
        title="FastClock"
        description="Coming soon — a free fasting timer with presets, history and streaks. Private and offline."
      />
      <ComingSoon />
      <ul className="mt-4 grid gap-3 sm:grid-cols-2">
        {FEATURES.map((feature) => (
          <li key={feature.name} className="rounded-[var(--radius)] border border-[var(--line)] p-4">
            <p className="font-semibold text-[var(--ink)]">{feature.name}</p>
            <p className="text-sm text-[var(--muted)]">{feature.what}</p>
          </li>
        ))}
      </ul>
    </>
  )
}

function About() {
  return (
    <>
      <PageHeader title="About" />
      <ComingSoon />
      <p className="mt-4 text-[var(--muted)]">
        FastClock will be a simple, free timer for intermittent fasting: start a fast, watch the
        clock, and keep a private history of past fasts. Everything will stay on your device, with no
        account, no subscription and no ads. It will offer general information only, not medical
        advice.
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

// Placeholder until the features are built. None of them work yet, so it says so plainly.
function ComingSoon() {
  return (
    <p className="rounded-[var(--radius)] border border-[var(--line)] bg-[var(--panel)] p-4 text-[var(--muted)]">
      Coming soon. FastClock is in development; the features below aren't available yet.
    </p>
  )
}
