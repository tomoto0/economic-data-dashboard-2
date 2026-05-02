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

export type IndicatorKey = (typeof economicDataPayload.indicators)[number]["key"];
export type CountryCode = (typeof economicDataPayload.countries)[number]["code"];

export type EconomicFilter = {
  countries?: string[];
  indicator?: string;
  yearStart?: number;
  yearEnd?: number;
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

function fallbackRecords(filter: EconomicFilter = {}) {
  const countries = filter.countries?.length ? filter.countries : economicDataPayload.countries.map(country => country.code);
  const indicator = filter.indicator ?? "gdp";
  const yearStart = filter.yearStart ?? 2000;
  const yearEnd = filter.yearEnd ?? 2026;
  return economicDataPayload.records.filter(record =>
    countries.includes(record.countryCode) &&
    record.indicatorKey === indicator &&
    record.year >= yearStart &&
    record.year <= yearEnd,
  );
}

export function getCatalog() {
  return {
    countries: economicDataPayload.countries,
    indicators: economicDataPayload.indicators,
    yearRange: { min: 2000, max: 2026 },
    recordCount: economicDataPayload.recordCount,
  };
}

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

export async function getEconomicRecords(filter: EconomicFilter = {}) {
  await ensureEconomicDataSeeded();
  const db = await getDb();
  if (!db) return fallbackRecords(filter);

  const countries = filter.countries?.length ? filter.countries : economicDataPayload.countries.map(country => country.code);
  const indicator = filter.indicator ?? "gdp";
  const yearStart = filter.yearStart ?? 2000;
  const yearEnd = filter.yearEnd ?? 2026;

  try {
    return await db
      .select()
      .from(economicDataPoints)
      .where(and(
        inArray(economicDataPoints.countryCode, countries),
        eq(economicDataPoints.indicatorKey, indicator),
        gte(economicDataPoints.year, yearStart),
        lte(economicDataPoints.year, yearEnd),
      ))
      .orderBy(economicDataPoints.year, economicDataPoints.countryCode);
  } catch (error) {
    console.warn("[Database] Query failed; falling back to bundled data:", error);
    return fallbackRecords(filter);
  }
}

export async function getLatestKpis(countries?: string[]) {
  const selectedCountries = countries?.length ? countries : economicDataPayload.countries.map(country => country.code);
  const indicators = economicDataPayload.indicators.map(indicator => indicator.key);
  const records = await getEconomicRecords({ countries: selectedCountries, indicator: "gdp", yearStart: 2000, yearEnd: 2026 });
  const useDbShape = records.length > 0 && "valueFormat" in records[0];

  const allRecords = useDbShape
    ? await Promise.all(indicators.map(indicator => getEconomicRecords({ countries: selectedCountries, indicator, yearStart: 2000, yearEnd: 2026 }))).then(chunks => chunks.flat())
    : economicDataPayload.records.filter(record => selectedCountries.includes(record.countryCode) && indicators.includes(record.indicatorKey));

  return selectedCountries.map(countryCode => {
    const country = economicDataPayload.countries.find(item => item.code === countryCode);
    const kpis = indicators.map(indicatorKey => {
      const indicator = economicDataPayload.indicators.find(item => item.key === indicatorKey);
      const series = allRecords
        .filter((record: any) => record.countryCode === countryCode && record.indicatorKey === indicatorKey && record.value !== null && record.value !== undefined)
        .sort((a: any, b: any) => b.year - a.year);
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

export async function getSnapshotMetadata() {
  await ensureEconomicDataSeeded();
  const db = await getDb();
  if (!db) {
    return { source: "bundled", recordCount: economicDataPayload.recordCount, generatedAt: null };
  }
  const rows = await db.select().from(economicSnapshots).orderBy(desc(economicSnapshots.createdAt)).limit(1);
  return rows[0] ?? { source: "bundled", recordCount: economicDataPayload.recordCount, generatedAt: null };
}

export async function getCachedWorldBankResult(cacheKey: string) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(worldBankCache).where(eq(worldBankCache.cacheKey, cacheKey)).limit(1);
  return rows[0] ?? null;
}

export async function saveWorldBankCache(input: InsertWorldBankCache) {
  const db = await getDb();
  if (!db) return;
  await db.insert(worldBankCache).values(input).onDuplicateKeyUpdate({
    set: {
      payload: input.payload,
      fetchedAt: sql`CURRENT_TIMESTAMP`,
      updatedAt: sql`CURRENT_TIMESTAMP`,
    },
  });
}

export async function saveInsightRequest(input: InsertInsightRequest) {
  const db = await getDb();
  if (!db) return;
  await db.insert(insightRequests).values(input);
}
