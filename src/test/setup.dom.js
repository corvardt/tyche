import { cleanup } from '@testing-library/react';
import { afterEach, beforeEach } from 'vitest';

/**
 * The jsdom half. Unlike the node setup this does not stub `localStorage` —
 * jsdom has a real one, and the point of running here is to be closer to the
 * browser, not further from it. It is emptied between tests so persisted keys,
 * settings and hits cannot leak from one into the next.
 */
beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  cleanup();
});
