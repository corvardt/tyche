import { defineConfig } from 'vitest/config';

/**
 * Kept separate from `vite.config.js` so the app build stays exactly what it
 * was: the test run needs no React plugin and no PostCSS, and loading them
 * only slows it down.
 *
 * Node environment throughout. Everything under `src/lib` is deliberately free
 * of the DOM — the quiet-failure logic lives there — and the two modules that
 * touch `localStorage` get a stub from `setup.js` rather than a whole jsdom.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.js'],
    setupFiles: ['src/test/setup.js'],
    restoreMocks: true,
  },
});
