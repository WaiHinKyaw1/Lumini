/**
 * Shared storage helpers — centralizes every localStorage key used across the app.
 *
 * Before this module, keys like 'lumina_user_stats', 'VITE_GEMINI_API_KEY',
 * 'lumina_refuel', etc. were scattered as raw string literals in App.tsx,
 * RecentHistory, refuelEngine, AuthScreen and more. Centralizing them here
 * prevents typos, makes renames trivial, and adds a single safe JSON parser.
 */

import type { JsonValue } from '../types';

export const STORAGE_KEYS = {
  userStats: 'lumina_user_stats',
  recentHistory: 'lumina_recent_history',
  geminiApiKey: 'VITE_GEMINI_API_KEY',
  refuel: 'lumina_refuel',
  rememberEmail: 'lumina_remember_email',
  batchQueue: 'lumina_batch_queue',
  voiceClones: 'lumina_voice_clones',
  brandKit: 'lumina_brand_kit',
} as const;

export type StorageKey = (typeof STORAGE_KEYS)[keyof typeof STORAGE_KEYS];

/** Safely parse stored JSON — never throws; returns `fallback` on invalid data */
export const readJson = <T,>(key: string, fallback: T): T => {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return parsed as T;
  } catch {
    return fallback;
  }
};

/** Safely write JSON — never throws (quota errors are silently ignored) */
export const writeJson = (key: string, value: unknown): void => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage unavailable or quota exceeded — degrade gracefully
  }
};

/** Remove a stored key safely */
export const removeItem = (key: string): void => {
  try {
    localStorage.removeItem(key);
  } catch {
    // ignore
  }
};
