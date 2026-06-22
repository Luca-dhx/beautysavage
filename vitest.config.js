import { defineConfig } from 'vitest/config';

// Backend test harness configuration (Phase 0.2).
// - Tests run in Node, sequentially per file (fileParallelism:false) to avoid
//   spinning multiple in-memory MongoDB instances at once.
// - testEnv.js sets fake/safe environment variables BEFORE any app import, so
//   the real .env (secrets, prod DB) is never used in tests.
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./tests/setup/testEnv.js'],
    include: ['tests/**/*.test.js'],
    testTimeout: 30000,
    hookTimeout: 120000, // in-memory mongod boot + app migrations can be slow on first run
    pool: 'forks',
    fileParallelism: false,
    // Surface unhandled rejections instead of hiding them
    dangerouslyIgnoreUnhandledErrors: false
  }
});
