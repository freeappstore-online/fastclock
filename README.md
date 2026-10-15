# FastClock

**A free intermittent fasting timer with presets, history and streaks. Private and offline.** A
free app on [FreeAppStore](https://freeappstore.online), live at
https://fastclock.freeappstore.online.

- One-button timer with presets (13:11, 16:8, 18:6, 20:4, OMAD 23:1, 36h) or a custom goal, and a
  live progress ring.
- Edit start and end times after the fact; an eating-window countdown to your next fast.
- A timeline of general fasting stages (information only, not medical advice).
- History: calendar, list, streak, average and longest fast, and a weekly chart.
- Your data stays on your device. No account needed; export and restore a JSON backup any time.

Built for [freeappstore-online/platform#203](https://github.com/freeappstore-online/platform/issues/203).

## Develop

```bash
pnpm install
pnpm dev      # local dev server
pnpm test     # typecheck + unit tests
pnpm build    # production build in web/dist
fas check     # FreeAppStore compliance checks
```

Pushes to `main` auto-deploy via GitHub Actions.

## License

MIT.
