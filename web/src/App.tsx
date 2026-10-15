import { useEffect, useState } from 'react'
import { initApp } from '@freeappstore/sdk'
import { BuildInfo, type NavItem, PageHeader, Shell } from '@freeappstore/sdk/ui'
import HistoryScreen from './HistoryScreen'
import Privacy from './Privacy'
import Timer from './Timer'

const fas = initApp({ appId: 'fastclock' })

// The app's screens. Shell renders them as its navbar (<nav aria-label="Main">,
// current screen highlighted, a menu on phones). `title` becomes the browser
// tab title on that route.
const NAV: NavItem[] = [
  { label: 'Timer', href: '/', title: 'FastClock' },
  { label: 'History', href: '/history', title: 'History — FastClock' },
  { label: 'Privacy', href: '/privacy', title: 'Privacy — FastClock' },
  { label: 'About', href: '/about', title: 'About — FastClock' },
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
      {/* Each screen scrolls inside the app frame; the page itself never does. */}
      <div className="fc-page">
        <div className="mx-auto w-full max-w-3xl p-4 sm:p-8">
          {path === '/about' ? (
            <About onNavigate={navigate} />
          ) : path === '/history' ? (
            <HistoryScreen />
          ) : path === '/privacy' ? (
            <Privacy />
          ) : (
            <Timer onNavigate={navigate} />
          )}
        </div>
        <BuildInfo />
      </div>
    </Shell>
  )
}

function About({ onNavigate }: { onNavigate: (href: string) => void }) {
  return (
    <>
      <PageHeader title="About" />
      <p className="text-[var(--muted)]">
        FastClock is a simple, free timer for intermittent fasting: pick a goal, start a fast, and
        watch the clock. Your fast is saved on your device, so it keeps running if you close the
        page. Your history, streak and weekly chart are on the History screen. There's no account, no
        subscription and no ads. FastClock offers general information only, not medical advice.
      </p>
      <p className="mt-4 text-[var(--muted)]">
        Everything you enter stays on this device.{' '}
        <a
          href="/privacy"
          className="underline"
          onClick={(e) => {
            e.preventDefault()
            onNavigate('/privacy')
          }}
        >
          Read the privacy note and back up your data
        </a>
        .
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
