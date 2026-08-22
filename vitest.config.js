import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

/**
 * Kept separate from `vite.config.js` so the app build stays exactly what it
 * was: neither project needs PostCSS, and loading it only slows the run down.
 *
 * Two projects, because the code divides cleanly in two and the halves want
 * different things:
 *
 * `lib` is deliberately free of the DOM (the quiet-failure logic lives there) and runs under node against a `localStorage` stub, which is stricter than the
 * browser's and so catches more. It is the faster half and stays that way.
 *
 * `ui` is the hooks and components, which need a document and React. `.test.jsx`
 * is what selects it: the extension says which world a test belongs to, so
 * neither project has to enumerate files.
 */
export default defineConfig({
  test: {
    restoreMocks: true,
    projects: [
      {
        test: {
          name: 'lib',
          environment: 'node',
          include: ['src/**/*.test.js'],
          setupFiles: ['src/test/setup.js'],
          restoreMocks: true,
        },
      },
      {
        plugins: [react()],
        test: {
          name: 'ui',
          environment: 'jsdom',
          include: ['src/**/*.test.jsx'],
          setupFiles: ['src/test/setup.dom.js'],
          restoreMocks: true,
        },
      },
    ],
  },
});
