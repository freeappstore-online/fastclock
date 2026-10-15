import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    // Run in a zone that observes DST so tests using the device time zone exercise it.
    env: { TZ: 'America/New_York' },
  },
})
