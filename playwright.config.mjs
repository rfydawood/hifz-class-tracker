import { defineConfig } from '@playwright/test';

// See IMPLEMENTATION_PLAN.md section 8. Run with the Firestore + Auth
// emulators up (they don't start on their own - see package.json's
// "test:e2e" script, which wraps both together via `firebase emulators:exec`
// so they're guaranteed to be running for the test and torn down after):
//   npm run test:e2e
export default defineConfig({
  testDir: 'tests',
  testMatch: '*.spec.mjs',
  timeout: 30000,
  fullyParallel: false,     // tests share the emulator's Firestore data
  webServer: {
    command: 'node scripts/static-server.mjs',
    url: 'http://127.0.0.1:5173/index.html',
    reuseExistingServer: !process.env.CI,
  },
  use: {
    baseURL: 'http://127.0.0.1:5173',
  },
});
