import { type ReactNode, useRef, useState } from 'react'
import { ConfirmDialog, PageHeader } from '@freeappstore/sdk/ui'
import { loadFasts } from './fast'
import { type BackupData, BackupError, backupFileName, eraseAll, makeBackup, parseBackup, restoreBackup } from './backup'
import { linkButton, solidButton } from './controls'

export default function Privacy() {
  return (
    <>
      <PageHeader title="Privacy" description="What FastClock keeps, where, and how to back it up." />
      <PrivacyNote />
      <BackupSection />
    </>
  )
}

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section
      aria-labelledby={id}
      className="mt-4 rounded-[var(--radius)] border border-[var(--line)] bg-[var(--panel)] p-4"
    >
      <h2 id={id} className="font-semibold text-[var(--ink)]">
        {title}
      </h2>
      <div className="mt-2 grid gap-3 text-sm text-[var(--muted)]">{children}</div>
    </section>
  )
}

export function PrivacyNote() {
  return (
    <Section id="privacy-note" title="Your data stays on this device">
      <ul className="grid list-disc gap-2 pl-5">
        <li>
          What's stored: your past fasts (start, end and goal), the fast that's running, and your chosen
          goal. They're kept only in this browser on this device. Nothing is uploaded, and FastClock never
          sends them anywhere.
        </li>
        <li>
          No account is needed. Signing in to FreeAppStore is optional, and FastClock doesn't add any of
          your data to your account.
        </li>
        <li>
          Page-view counts: the app loads FreeAppStore's store analytics script, which records which
          screen you opened (for example /history), the page that linked here, and the time. It's sent to
          FreeAppStore without cookies and without your account, and held in this browser while you're
          offline. Your fasts are never included.
        </li>
        <li>
          FastClock is served via FreeAppStore, which also loads Cloudflare Web Analytics (beacon.min.js
          from static.cloudflareinsights.com). It doesn't use cookies and reports only aggregate page-view
          statistics, such as page load times and visit counts. As with any website, the servers handling
          these requests see your IP address and browser type.
        </li>
        <li>No ads, no tracking cookies, and no advertising or tracking SDKs.</li>
        <li>
          Clearing this browser's data or uninstalling the app deletes your fasts. Export a backup below
          to keep a copy.
        </li>
      </ul>
    </Section>
  )
}

const quietButton =
  'min-h-11 rounded-full border border-[var(--line-strong)] px-5 text-sm font-semibold text-[var(--ink)] hover:border-[var(--accent)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]'

function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  // Give the browser a moment to start the download before releasing it.
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

const plural = (n: number) => `${n} ${n === 1 ? 'fast' : 'fasts'}`

function BackupSection() {
  const fileInput = useRef<HTMLInputElement>(null)
  const [pending, setPending] = useState<BackupData | null>(null)
  const [erasing, setErasing] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const current = loadFasts(localStorage).length

  return (
    <Section id="backup" title="Backup">
      <p>
        Save all your fasts and settings, including a fast that's running, as one JSON file. Keep it
        somewhere safe and restore it here on this or another device.
      </p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={solidButton}
          onClick={() => {
            const now = Date.now()
            const backup = makeBackup(localStorage, now)
            download(backupFileName(now), JSON.stringify(backup, null, 2))
            setError(null)
            setMessage(`Exported ${plural(backup.fasts.length)}${backup.active ? ' and your running fast' : ''}.`)
          }}
        >
          Export backup
        </button>
        <button type="button" className={quietButton} onClick={() => fileInput.current?.click()}>
          Restore from file
        </button>
        <input
          ref={fileInput}
          type="file"
          accept="application/json,.json"
          className="sr-only"
          tabIndex={-1}
          aria-label="Backup file to restore"
          onChange={async (e) => {
            const file = e.target.files?.[0]
            e.target.value = ''
            if (!file) return
            setMessage(null)
            try {
              setPending(parseBackup(await file.text()))
              setError(null)
            } catch (err) {
              setError(err instanceof BackupError ? err.message : "That file couldn't be read.")
            }
          }}
        />
      </div>
      {message && (
        <p role="status" className="text-[var(--ink)]">
          {message}
        </p>
      )}
      {error && (
        <p role="alert" className="font-medium text-[var(--danger)]">
          {error}
        </p>
      )}
      <p>
        <button
          type="button"
          className={`${linkButton} px-0 text-[var(--danger)] hover:text-[var(--danger)]`}
          onClick={() => setErasing(true)}
        >
          Erase all FastClock data on this device
        </button>
      </p>
      <ConfirmDialog
        open={pending !== null}
        title="Restore this backup?"
        message={
          pending
            ? `This replaces the ${plural(current)} on this device with the ${plural(pending.fasts.length)} in the file${
                pending.active ? ', plus its running fast' : ''
              }, and your goal setting. It can't be undone.`
            : ''
        }
        confirmLabel="Restore"
        onConfirm={() => {
          if (pending) {
            restoreBackup(localStorage, pending)
            setMessage(`Restored ${plural(pending.fasts.length)}.`)
          }
          setPending(null)
        }}
        onCancel={() => setPending(null)}
      />
      <ConfirmDialog
        open={erasing}
        title="Erase all FastClock data?"
        message="This deletes every past fast, the running fast and your goal setting from this device. It can't be undone."
        confirmLabel="Erase everything"
        variant="danger"
        onConfirm={() => {
          eraseAll(localStorage)
          setErasing(false)
          setError(null)
          setMessage('All FastClock data on this device was erased.')
        }}
        onCancel={() => setErasing(false)}
      />
    </Section>
  )
}
