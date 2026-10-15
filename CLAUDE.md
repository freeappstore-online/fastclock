# fastclock

FastClock: a free intermittent fasting timer on FreeAppStore — one-button timer with presets, a
live progress ring, an eating-window countdown, an informational stages timeline, and a private
history with streaks and a weekly chart. Everything stays on the device (localStorage). The timer core (start/end,
presets, live ring), time editing, a basic past-fasts list, the eating-window countdown and the stages timeline are
built; the rest is listed as "Coming next" on the Timer screen. See freeappstore-online/platform#203.

- Live: https://fastclock.freeappstore.online
- Dev: `pnpm install && pnpm dev`
- Build: `pnpm build`
- Test: `pnpm test` (typecheck + vitest; tests run with TZ=America/New_York so DST is exercised)
- Check: `fas check`
- Deploy: `git push origin main` (auto-deploys to R2 via GitHub Actions)

## Notes

- Fonts are self-hosted (`@fontsource-variable/*`); the app makes no third-party requests
  beyond the platform API and analytics loader. Keep it that way.
- Timer math lives in `web/src/fast.ts`: store instants as epoch ms, compute durations by
  subtraction, and compare calendar days as local dates (never "+24h"). Keep it pure and tested.
- No medical or weight-loss claims in any copy; stages are general information, not advice.
  `stages.test.ts` scans screen copy for claim words, so `pnpm test` fails if one slips in.

Platform conventions: https://raw.githubusercontent.com/freeappstore-online/freeappstore/main/SKILLS.md
