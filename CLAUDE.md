# fastclock

FastClock: a free intermittent fasting timer on FreeAppStore — one-button timer with presets, a
live progress ring, an eating-window countdown, an informational stages timeline, and a private
history with streaks and a weekly chart. Everything stays on the device (localStorage). Currently
a "Coming soon" shell (Timer, About); see freeappstore-online/platform#203.

- Live: https://fastclock.freeappstore.online
- Dev: `pnpm install && pnpm dev`
- Build: `pnpm build`
- Check: `fas check`
- Deploy: `git push origin main` (auto-deploys to R2 via GitHub Actions)

## Notes

- Fonts are self-hosted (`@fontsource-variable/*`); the app makes no third-party requests
  beyond the platform API and analytics loader. Keep it that way.
- No medical or weight-loss claims in any copy; stages are general information, not advice.

Platform conventions: https://raw.githubusercontent.com/freeappstore-online/freeappstore/main/SKILLS.md
