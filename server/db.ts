import { and, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  economicDataPoints,
  economicSnapshots,
  insightRequests,
  InsertEconomicDataPoint,
  InsertEconomicSnapshot,
  InsertInsightRequest,
  InsertUser,
  InsertWorldBankCache,
  users,
  worldBankCache,
} from "../drizzle/schema";
import { economicDataPayload } from "./data/economicData";
import { ENV } from "./_core/env";

let _db: ReturnType<typeof drizzle> | null = null;
let seedPromise: Promise<void> | null = null;
const SOURCE_HASH = "repository-economic-data-2025-06-23-v1";

/** 24-hour TTL for World Bank API cache entries */
const WB_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

export type IndicatorKey = (typeof economicDataPayload.indicators)[number]["key"];
export type CountryCode = (typeof economicDataPayload.countries)[number]["code"];

export type EconomicFilter = {
  countries?: string[];
  indicator?: string;
  yearStart?: number;
  yearEnd?: number;
};

/** Describes where a data point originated */
export type DataSource = "world_bank_live" | "world_bank_cache" | "snapshot";

export type EconomicRecord = {
  countryCode: string;
  countryIso3: string;
  countryName: string;
  indicatorKey: string;
  indicatorLabel: string;
  indicatorSourceName: string;
  unit: string;
  valueFormat: string;
  worldBankCode: string;
  year: number;
  value: number | null;
  source: string;
};

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) return;

  const values: InsertUser = { openId: user.openId };
  const updateSet: Record<string, unknown> = {};
  const textFields = ["name", "email", "loginMethod"] as const;

  textFields.forEach(field => {
    const value = user[field];
    if (value === undefined) return;
    const normalized = value ?? null;
    values[field] = normalized;
    updateSet[field] = normalized;
  });

  values.lastSignedIn = user.lastSignedIn ?? new Date();
  updateSet.lastSignedIn = values.lastSignedIn;
  values.role = user.role ?? (user.openId === ENV.ownerOpenId ? "admin" : "user");
  updateSet.role = values.role;

  await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

// ---------------------------------------------------------------------------
// Catalog helpers
// ---------------------------------------------------------------------------

export function getCatalog() {
  return {
    countries: economicDataPayload.countries,
    indicators: economicDataPayload.indicators,
    yearRange: { min: 2000, max: new Date().getFullYear() },
    recordCount: economicDataPayload.recordCount,
  };
}

// ---------------------------------------------------------------------------
// Snapshot seeding (CSV-derived baseline, runs once)
// ---------------------------------------------------------------------------

export async function ensureEconomicDataSeeded() {
  if (seedPromise) return seedPromise;
  seedPromise = (async () => {
    const db = await getDb();
    if (!db) return;

    const existing = await db.select().from(economicSnapshots).where(eq(economicSnapshots.sourceHash, SOURCE_HASH)).limit(1);
    if (existing.length > 0) return;

    const snapshot: InsertEconomicSnapshot = {
      source: "repository:economic_data.csv",
      sourceHash: SOURCE_HASH,
      recordCount: economicDataPayload.recordCount,
    };
    await db.insert(economicSnapshots).values(snapshot);
    const rows = await db.select().from(economicSnapshots).where(eq(economicSnapshots.sourceHash, SOURCE_HASH)).limit(1);
    const snapshotId = rows[0]?.id;
    if (!snapshotId) return;

    const values: InsertEconomicDataPoint[] = economicDataPayload.records.map(record => ({
      snapshotId,
      countryCode: record.countryCode,
      countryIso3: record.countryIso3,
      countryName: record.countryName,
      indicatorKey: record.indicatorKey,
      indicatorLabel: record.indicatorLabel,
      indicatorSourceName: record.indicatorSourceName,
      unit: record.unit,
      valueFormat: record.format,
      worldBankCode: record.worldBankCode,
      year: record.year,
      value: record.value,
      source: record.source,
    }));

    for (let index = 0; index < values.length; index += 250) {
      await db.insert(economicDataPoints).values(values.slice(index, index + 250));
    }
  })().catch(error => {
    seedPromise = null;
    console.warn("[Database] Economic seed failed; falling back to bundled data:", error);
  });
  return seedPromise;
}

// ---------------------------------------------------------------------------
// World Bank API live-fetch with TTL cache
// ---------------------------------------------------------------------------

/**
 * Fetch a single country+indicator time series from the World Bank Open Data API.
 * Returns parsed data rows and the source label.
 */
async function fetchFromWorldBank(
  iso3: string,
  wbCode: string,
  yearStart: number,
  yearEnd: number,
): Promise<{ rows: Array<{ year: number; value: number | null }>; fetchedAt: Date }> {
  const url = `https://api.worldbank.org/v2/country/${iso3}/indicator/${wbCode}?format=json&per_page=100&date=${yearStart}:${yearEnd}&mrv=100`;
  const response = await fetch(url, { signal: AbortSignal.timeout(12_000) });
  if (!response.ok) throw new Error(`World Bank API returned HTTP ${response.status} for ${iso3}/${wbCode}`);
  const json: any = await response.json();
  const dataArray: any[] = Array.isArray(json) && json.length >= 2 ? json[1] ?? [] : [];
  const rows = dataArray.map((item: any) => ({
    year: parseInt(item.date, 10),
    value: item.value !== null && item.value !== undefined ? Number(item.value) : null,
  })).filter(row => !Number.isNaN(row.year));
  return { rows, fetchedAt: new Date() };
}

/**
 * Check the cache for a valid (non-expired) entry.
 */
export async function getCachedWorldBankResult(cacheKey: string) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(worldBankCache).where(eq(worldBankCache.cacheKey, cacheKey)).limit(1);
  const entry = rows[0];
  if (!entry) return null;
  // Return null if expired so caller will re-fetch
  if (entry.expiresAt < new Date()) return null;
  return entry;
}

/**
 * Persist a World Bank API response to the cache with a 24-hour TTL.
 */
export async function saveWorldBankCache(input: InsertWorldBankCache) {
  const db = await getDb();
  if (!db) return;
  await db.insert(worldBankCache).values(input).onDuplicateKeyUpdate({
    set: {
      payload: input.payload,
      fetchedAt: sql`CURRENT_TIMESTAMP`,
      expiresAt: input.expiresAt,
      updatedAt: sql`CURRENT_TIMESTAMP`,
    },
  });
}

/**
 * Invalidate (delete) all cache entries for a given country+indicator combination
 * so the next request forces a fresh World Bank fetch.
 */
export async function invalidateWorldBankCache(countryCode: string, indicatorKey: string) {
  const db = await getDb();
  if (!db) return;
  await db
    .delete(worldBankCache)
    .where(and(eq(worldBankCache.countryCode, countryCode), eq(worldBankCache.indicatorKey, indicatorKey)));
}

// ---------------------------------------------------------------------------
// Primary data accessor — World Bank API first, cache second, snapshot fallback
// ---------------------------------------------------------------------------

export type GetEconomicRecordsResult = {
  records: EconomicRecord[];
  dataSource: DataSource;
  fetchedAt: Date | null;
};

/**
 * Retrieve economic records for the given filter.
 *
 * Priority:
 *  1. World Bank Open Data API (live fetch, result cached 24 h)
 *  2. Valid unexpired cache entry from a previous live fetch
 *  3. DB snapshot seeded from repository CSV
 *  4. In-memory bundled data (if DB is unavailable)
 */
export async function getEconomicRecords(filter: EconomicFilter = {}): Promise<GetEconomicRecordsResult> {
  await ensureEconomicDataSeeded();

  const countries = filter.countries?.length ? filter.countries : economicDataPayload.countries.map(c => c.code);
  const indicator = filter.indicator ?? "gdp";
  const yearStart = filter.yearStart ?? 2000;
  const yearEnd = filter.yearEnd ?? new Date().getFullYear();

  const catalogIndicator = economicDataPayload.indicators.find(i => i.key === indicator);
  if (!catalogIndicator) {
    return { records: fallbackRecords(filter), dataSource: "snapshot", fetchedAt: null };
  }

  // Try to fetch live from World Bank for each requested country
  const liveRecords: EconomicRecord[] = [];
  let anyLive = false;
  let anyCache = false;
  let latestFetchedAt: Date | null = null;

  for (const countryCode of countries) {
    const country = economicDataPayload.countries.find(c => c.code === countryCode);
    if (!country) continue;
    const iso3 = country.iso3;
    const cacheKey = `${iso3}:${catalogIndicator.worldBankCode}:${yearStart}:${yearEnd}`;

    // Check cache first
    const cached = await getCachedWorldBankResult(cacheKey);
    if (cached) {
      // Valid cache hit — parse and use
      try {
        const payload: any = JSON.parse(cached.payload);
        const dataArray: any[] = Array.isArray(payload) && payload.length >= 2 ? payload[1] ?? [] : [];
        for (const item of dataArray) {
          const year = parseInt(item.date, 10);
          if (Number.isNaN(year) || year < yearStart || year > yearEnd) continue;
          liveRecords.push({
            countryCode: country.code,
            countryIso3: iso3,
            countryName: country.name,
            indicatorKey: indicator,
            indicatorLabel: catalogIndicator.label,
            indicatorSourceName: (catalogIndicator as any).sourceName ?? catalogIndicator.label,
            unit: catalogIndicator.unit,
            valueFormat: catalogIndicator.format,
            worldBankCode: catalogIndicator.worldBankCode,
            year,
            value: item.value !== null && item.value !== undefined ? Number(item.value) : null,
            source: "World Bank Open Data (cached)",
          });
        }
        anyCache = true;
        if (!latestFetchedAt || cached.fetchedAt > latestFetchedAt) latestFetchedAt = cached.fetchedAt;
        continue;
      } catch {
        // Corrupted cache — fall through to live fetch
      }
    }

    // Live fetch from World Bank API
    try {
      const { rows, fetchedAt } = await fetchFromWorldBank(iso3, catalogIndicator.worldBankCode, yearStart, yearEnd);
      const expiresAt = new Date(fetchedAt.getTime() + WB_CACHE_TTL_MS);

      // Build raw WB API response format for caching
      const fakePayload = JSON.stringify([
        {},
        rows.map(r => ({ date: String(r.year), value: r.value })),
      ]);
      await saveWorldBankCache({
        cacheKey,
        countryCode: iso3,
        indicatorKey: indicator,
        yearStart,
        yearEnd,
        payload: fakePayload,
        expiresAt,
      } as InsertWorldBankCache & { expiresAt: Date });

      for (const row of rows) {
        if (row.year < yearStart || row.year > yearEnd) continue;
        liveRecords.push({
          countryCode: country.code,
          countryIso3: iso3,
          countryName: country.name,
          indicatorKey: indicator,
          indicatorLabel: catalogIndicator.label,
          indicatorSourceName: (catalogIndicator as any).sourceName ?? catalogIndicator.label,
          unit: catalogIndicator.unit,
          valueFormat: catalogIndicator.format,
          worldBankCode: catalogIndicator.worldBankCode,
          year: row.year,
          value: row.value,
          source: "World Bank Open Data (live)",
        });
      }
      anyLive = true;
      if (!latestFetchedAt || fetchedAt > latestFetchedAt) latestFetchedAt = fetchedAt;
    } catch (error) {
      console.warn(`[WorldBank] Live fetch failed for ${iso3}/${indicator}:`, error);
      // Fall through — this country will be missing from liveRecords; handled below
    }
  }

  // If we got live/cached data for at least some countries, return it
  if (liveRecords.length > 0) {
    const sorted = liveRecords.sort((a, b) => a.year - b.year || a.countryCode.localeCompare(b.countryCode));
    return {
      records: sorted,
      dataSource: anyLive ? "world_bank_live" : "world_bank_cache",
      fetchedAt: latestFetchedAt,
    };
  }

  // Fallback: DB snapshot
  const db = await getDb();
  if (db) {
    try {
      const rows = await db
        .select()
        .from(economicDataPoints)
        .where(and(
          inArray(economicDataPoints.countryCode, countries),
          eq(economicDataPoints.indicatorKey, indicator),
          gte(economicDataPoints.year, yearStart),
          lte(economicDataPoints.year, yearEnd),
        ))
        .orderBy(economicDataPoints.year, economicDataPoints.countryCode);
      if (rows.length > 0) {
        return { records: rows as EconomicRecord[], dataSource: "snapshot", fetchedAt: null };
      }
    } catch (error) {
      console.warn("[Database] Snapshot query failed:", error);
    }
  }

  // Final fallback: bundled in-memory data
  return { records: fallbackRecords(filter), dataSource: "snapshot", fetchedAt: null };
}

function fallbackRecords(filter: EconomicFilter = {}): EconomicRecord[] {
  const countries = filter.countries?.length ? filter.countries : economicDataPayload.countries.map(c => c.code);
  const indicator = filter.indicator ?? "gdp";
  const yearStart = filter.yearStart ?? 2000;
  const yearEnd = filter.yearEnd ?? new Date().getFullYear();
  return (economicDataPayload.records as unknown as any[]).filter(r =>
    countries.includes(r.countryCode) &&
    r.indicatorKey === indicator &&
    r.year >= yearStart &&
    r.year <= yearEnd,
  ).map(r => ({ ...r, valueFormat: r.format }));
}

// ---------------------------------------------------------------------------
// KPI comparison — uses live data pipeline
// ---------------------------------------------------------------------------

export async function getLatestKpis(countries?: string[]) {
  const selectedCountries = countries?.length ? countries : economicDataPayload.countries.map(c => c.code);
  const indicators = economicDataPayload.indicators.map(i => i.key);

  const allRecords: EconomicRecord[] = [];
  for (const indicatorKey of indicators) {
    const result = await getEconomicRecords({ countries: selectedCountries, indicator: indicatorKey, yearStart: 2000, yearEnd: new Date().getFullYear() });
    allRecords.push(...result.records);
  }

  return selectedCountries.map(countryCode => {
    const country = economicDataPayload.countries.find(c => c.code === countryCode);
    const kpis = indicators.map(indicatorKey => {
      const indicator = economicDataPayload.indicators.find(i => i.key === indicatorKey);
      const series = allRecords
        .filter(r => r.countryCode === countryCode && r.indicatorKey === indicatorKey && r.value !== null && r.value !== undefined)
        .sort((a, b) => b.year - a.year);
      const latest = series[0];
      const previous = series[1];
      return {
        indicatorKey,
        label: indicator?.label ?? indicatorKey,
        unit: indicator?.unit ?? "",
        format: indicator?.format ?? "number",
        year: latest?.year ?? null,
        value: latest?.value ?? null,
        previousValue: previous?.value ?? null,
        change: latest && previous && latest.value !== null && previous.value !== null ? latest.value - previous.value : null,
      };
    });
    return { countryCode, countryName: country?.name ?? countryCode, kpis };
  });
}

// ---------------------------------------------------------------------------
// Snapshot metadata
// ---------------------------------------------------------------------------

export async function getSnapshotMetadata() {
  await ensureEconomicDataSeeded();
  const db = await getDb();
  if (!db) {
    return { source: "bundled", recordCount: economicDataPayload.recordCount, generatedAt: null };
  }
  const rows = await db.select().from(economicSnapshots).orderBy(desc(economicSnapshots.createdAt)).limit(1);
  return rows[0] ?? { source: "bundled", recordCount: economicDataPayload.recordCount, generatedAt: null };
}

// ---------------------------------------------------------------------------
// Insight request persistence
// ---------------------------------------------------------------------------

export async function saveInsightRequest(input: InsertInsightRequest) {
  const db = await getDb();
  if (!db) return;
  await db.insert(insightRequests).values(input);
}
