import sql from './db.ts';

// --- Profile View Recording ---

export async function recordProfileView(
  sitterId: number,
  source: string = 'direct',
  sessionId?: string,
): Promise<boolean> {
  // Validate sitter exists
  const [sitter] = await sql`
    SELECT id FROM users WHERE id = ${sitterId} AND role IN ('sitter', 'both')
  `;
  if (!sitter) {
    return false;
  }

  // Deduplicate by session_id within 24h
  if (sessionId) {
    const [existing] = await sql`
      SELECT id FROM profile_views
      WHERE sitter_id = ${sitterId}
        AND session_id = ${sessionId}
        AND viewed_at > NOW() - INTERVAL '24 hours'
      LIMIT 1
    `;
    if (existing) {
      return true; // Already recorded, skip
    }
  }

  const validSources = ['search', 'direct', 'favorites'];
  const normalizedSource = validSources.includes(source) ? source : 'direct';

  await sql`
    INSERT INTO profile_views (sitter_id, source, session_id)
    VALUES (${sitterId}, ${normalizedSource}, ${sessionId ?? null})
  `;

  return true;
}

// --- Profile View Analytics ---

interface ViewsByDay {
  readonly date: string;
  readonly count: number;
}

interface ViewsBySource {
  readonly source: string;
  readonly count: number;
}

export interface ProfileViewsAnalytics {
  readonly total_views: number;
  readonly views_by_day: ReadonlyArray<ViewsByDay>;
  readonly views_by_source: ReadonlyArray<ViewsBySource>;
}

export async function getProfileViewsAnalytics(
  sitterId: number,
  startDate: string,
  endDate: string,
  isPro: boolean,
): Promise<ProfileViewsAnalytics> {
  const [totalResult] = await sql`
    SELECT COUNT(*)::int AS total_views
    FROM profile_views
    WHERE sitter_id = ${sitterId}
      AND viewed_at >= ${startDate}::timestamptz
      AND viewed_at < ${endDate}::timestamptz
  `;

  const viewsBySource = await sql`
    SELECT source, COUNT(*)::int AS count
    FROM profile_views
    WHERE sitter_id = ${sitterId}
      AND viewed_at >= ${startDate}::timestamptz
      AND viewed_at < ${endDate}::timestamptz
    GROUP BY source
    ORDER BY count DESC
  `;

  // Daily breakdown only for Pro users
  const viewsByDay = isPro
    ? await sql`
        SELECT TO_CHAR(viewed_at, 'YYYY-MM-DD') AS date, COUNT(*)::int AS count
        FROM profile_views
        WHERE sitter_id = ${sitterId}
          AND viewed_at >= ${startDate}::timestamptz
          AND viewed_at < ${endDate}::timestamptz
        GROUP BY TO_CHAR(viewed_at, 'YYYY-MM-DD')
        ORDER BY date
      `
    : [];

  return {
    total_views: totalResult.total_views,
    views_by_day: viewsByDay.map((r: { date: string; count: number }) => ({
      date: r.date,
      count: r.count,
    })),
    views_by_source: viewsBySource.map((r: { source: string; count: number }) => ({
      source: r.source,
      count: r.count,
    })),
  };
}

// --- Profile Views Count (for overview) ---

export async function getProfileViewsCount(
  sitterId: number,
  startDate: string,
  endDate: string,
): Promise<number> {
  const [result] = await sql`
    SELECT COUNT(*)::int AS total
    FROM profile_views
    WHERE sitter_id = ${sitterId}
      AND viewed_at >= ${startDate}::timestamptz
      AND viewed_at < ${endDate}::timestamptz
  `;
  return result.total;
}
