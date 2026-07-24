/**
 * localStorage wrappers. Every access is guarded: Safari private mode and
 * disabled-storage settings make these calls throw, which previously took the
 * whole render down.
 */

export function readString(key, fallback = null) {
  try {
    const value = localStorage.getItem(key);
    return value === null ? fallback : value;
  } catch {
    return fallback;
  }
}

export function writeString(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Storage unavailable or full; the app works fine without persistence.
  }
}

export function readNumber(key, fallback = 0) {
  const parsed = Number(readString(key, ''));
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function readJSON(key, fallback) {
  const raw = readString(key);
  if (raw === null) return fallback;
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export function writeJSON(key, value) {
  writeString(key, JSON.stringify(value));
}
