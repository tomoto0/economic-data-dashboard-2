import { double, index, int, mysqlEnum, mysqlTable, text, timestamp, uniqueIndex, varchar } from "drizzle-orm/mysql-core";

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export const economicSnapshots = mysqlTable("economic_snapshots", {
  id: int("id").autoincrement().primaryKey(),
  source: varchar("source", { length: 255 }).notNull(),
  sourceHash: varchar("sourceHash", { length: 80 }).notNull(),
  recordCount: int("recordCount").notNull(),
  generatedAt: timestamp("generatedAt").defaultNow().notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => ({
  sourceHashIdx: uniqueIndex("economic_snapshots_source_hash_idx").on(table.sourceHash),
}));

export const economicDataPoints = mysqlTable("economic_data_points", {
  id: int("id").autoincrement().primaryKey(),
  snapshotId: int("snapshotId").notNull(),
  countryCode: varchar("countryCode", { length: 2 }).notNull(),
  countryIso3: varchar("countryIso3", { length: 3 }).notNull(),
  countryName: varchar("countryName", { length: 120 }).notNull(),
  indicatorKey: varchar("indicatorKey", { length: 64 }).notNull(),
  indicatorLabel: varchar("indicatorLabel", { length: 160 }).notNull(),
  indicatorSourceName: varchar("indicatorSourceName", { length: 255 }).notNull(),
  unit: varchar("unit", { length: 80 }).notNull(),
  valueFormat: varchar("valueFormat", { length: 32 }).notNull(),
  worldBankCode: varchar("worldBankCode", { length: 64 }).notNull(),
  year: int("year").notNull(),
  value: double("value"),
  source: varchar("source", { length: 255 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => ({
  lookupIdx: index("economic_points_lookup_idx").on(table.countryCode, table.indicatorKey, table.year),
  uniquePointIdx: uniqueIndex("economic_points_unique_idx").on(table.snapshotId, table.countryCode, table.indicatorKey, table.year),
}));

export const worldBankCache = mysqlTable("world_bank_cache", {
  id: int("id").autoincrement().primaryKey(),
  cacheKey: varchar("cacheKey", { length: 255 }).notNull(),
  countryCode: varchar("countryCode", { length: 8 }).notNull(),
  indicatorKey: varchar("indicatorKey", { length: 64 }).notNull(),
  yearStart: int("yearStart").notNull(),
  yearEnd: int("yearEnd").notNull(),
  payload: text("payload").notNull(),
  fetchedAt: timestamp("fetchedAt").defaultNow().notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => ({
  cacheKeyIdx: uniqueIndex("world_bank_cache_key_idx").on(table.cacheKey),
}));

export const insightRequests = mysqlTable("insight_requests", {
  id: int("id").autoincrement().primaryKey(),
  indicatorKey: varchar("indicatorKey", { length: 64 }).notNull(),
  countryCodes: varchar("countryCodes", { length: 120 }).notNull(),
  yearStart: int("yearStart").notNull(),
  yearEnd: int("yearEnd").notNull(),
  prompt: text("prompt").notNull(),
  response: text("response").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => ({
  insightLookupIdx: index("insight_lookup_idx").on(table.indicatorKey, table.yearStart, table.yearEnd),
}));

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type EconomicSnapshot = typeof economicSnapshots.$inferSelect;
export type InsertEconomicSnapshot = typeof economicSnapshots.$inferInsert;
export type EconomicDataPoint = typeof economicDataPoints.$inferSelect;
export type InsertEconomicDataPoint = typeof economicDataPoints.$inferInsert;
export type WorldBankCache = typeof worldBankCache.$inferSelect;
export type InsertWorldBankCache = typeof worldBankCache.$inferInsert;
export type InsightRequest = typeof insightRequests.$inferSelect;
export type InsertInsightRequest = typeof insightRequests.$inferInsert;
