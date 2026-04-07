import sql from './db.ts';
import logger from './logger.ts';

interface CacheEntry {
  value: unknown;
  expiresAt: number;
}

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const cache = new Map<string, CacheEntry>();

export async function getSetting<T = unknown>(key: string): Promise<T | null> {
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value as T;
  }

  const [row] = await sql`
    SELECT value FROM platform_settings WHERE key = ${key}
  `.catch(() => []);

  if (!row) return null;

  cache.set(key, { value: row.value, expiresAt: Date.now() + CACHE_TTL_MS });
  return row.value as T;
}

export async function setSetting(key: string, value: unknown, updatedBy: number): Promise<void> {
  const jsonValue = sql.json(value as any);
  await sql`
    INSERT INTO platform_settings (key, value, updated_by, updated_at)
    VALUES (${key}, ${jsonValue}, ${updatedBy}, NOW())
    ON CONFLICT (key) DO UPDATE SET
      value = ${jsonValue},
      updated_by = ${updatedBy},
      updated_at = NOW()
  `;
  cache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
}

export async function isBetaActive(): Promise<boolean> {
  const val = await getSetting<{ active: boolean }>('beta_active');
  return val?.active === true;
}

export async function getBetaEndDate(): Promise<Date | null> {
  const val = await getSetting<{ date: string }>('beta_end_date');
  if (!val?.date) return null;
  return new Date(val.date);
}

export async function getProTrialDays(): Promise<number> {
  const val = await getSetting<{ days: number }>('pro_trial_days');
  return val?.days ?? 30;
}

/** Clear the in-memory cache (useful for tests). */
export function clearSettingsCache(): void {
  cache.clear();
}
