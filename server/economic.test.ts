import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";

vi.mock("./_core/llm", () => ({
  invokeLLM: vi.fn(async () => ({
    choices: [
      {
        message: {
          content: "### Summary\n\nThe selected countries show divergent macroeconomic trends with meaningful differences in recent values.",
        },
      },
    ],
  })),
}));

const { appRouter } = await import("./routers");

function createPublicContext(): TrpcContext {
  return {
    user: null,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: vi.fn(),
    } as unknown as TrpcContext["res"],
  };
}

describe("economic tRPC endpoints", () => {
  beforeEach(() => {
    process.env.DATABASE_URL = "";
    vi.restoreAllMocks();
  });

  it("returns catalog metadata for supported countries and indicators", async () => {
    const caller = appRouter.createCaller(createPublicContext());

    const catalog = await caller.economic.catalog();

    expect(catalog.countries.map(country => country.code)).toEqual(expect.arrayContaining(["US", "CN", "JP", "DE", "GB", "FR", "IN", "IT", "BR", "CA"]));
    expect(catalog.indicators.map(indicator => indicator.key)).toEqual(expect.arrayContaining(["gdp", "population", "inflation", "unemployment", "fdi", "reserves"]));
    expect(catalog.recordCount).toBeGreaterThan(0);
    expect(catalog.yearRange).toEqual({ min: 2000, max: 2026 });
  });

  it("filters chart-ready data by country, indicator, and year range", { timeout: 30000 }, async () => {
    const caller = appRouter.createCaller(createPublicContext());

    const result = await caller.economic.chartData({ countries: ["US", "JP"], indicator: "gdp", yearStart: 2018, yearEnd: 2020 });

    expect(result.indicator?.key).toBe("gdp");
    expect(result.countries.map(country => country.code).sort()).toEqual(["JP", "US"]);
    // series may have fewer entries if some years have no data from World Bank
    expect(result.series.length).toBeGreaterThanOrEqual(1);
    expect(result.raw.every(record => ["US", "JP"].includes(record.countryCode) && record.indicatorKey === "gdp")).toBe(true);
  });

  it("returns latest comparison KPI cards for selected countries", { timeout: 30000 }, async () => {
    const caller = appRouter.createCaller(createPublicContext());

    const comparison = await caller.economic.comparison({ countries: ["US", "CN"] });

    expect(comparison).toHaveLength(2);
    expect(comparison[0]?.kpis.map(kpi => kpi.indicatorKey)).toEqual(expect.arrayContaining(["gdp", "population", "inflation", "unemployment", "fdi", "reserves"]));
    expect(comparison[0]?.kpis[0]?.year).toBeGreaterThanOrEqual(2000);
  });

  it("refreshData clears cache and re-fetches from World Bank", { timeout: 30000 }, async () => {
    const caller = appRouter.createCaller(createPublicContext());

    const result = await caller.economic.refreshData({ countries: ["US"], indicator: "gdp", yearStart: 2020, yearEnd: 2022 });

    expect(result).toHaveProperty("refreshedAt");
    expect(result.countriesRefreshed).toBe(1);
    expect(["world_bank_live", "world_bank_cache", "snapshot"]).toContain(result.dataSource);
    expect(result.series).toBeInstanceOf(Array);
  });

  it("generates and returns AI insight markdown for the selected data slice", async () => {
    const caller = appRouter.createCaller(createPublicContext());

    const result = await caller.economic.insight({ countries: ["US", "CN"], indicator: "inflation", yearStart: 2019, yearEnd: 2022 });

    expect(result.recordCount).toBeGreaterThan(0);
    expect(result.insight).toContain("Summary");
    expect(result.generatedAt).toBeInstanceOf(Date);
  });

  it("chartData response includes dataSource and fetchedAt fields", { timeout: 30000 }, async () => {
    const caller = appRouter.createCaller(createPublicContext());

    const result = await caller.economic.chartData({ countries: ["US"], indicator: "gdp", yearStart: 2018, yearEnd: 2020 });

    expect(result).toHaveProperty("dataSource");
    expect(["world_bank_live", "world_bank_cache", "snapshot"]).toContain(result.dataSource);
    // fetchedAt may be null when using snapshot fallback
    expect(result).toHaveProperty("fetchedAt");
  });

  it("refreshData returns refreshedAt, countriesRefreshed, dataSource, and series", { timeout: 30000 }, async () => {
    const caller = appRouter.createCaller(createPublicContext());

    const result = await caller.economic.refreshData({ countries: ["US"], indicator: "gdp", yearStart: 2018, yearEnd: 2023 });

    expect(result).toHaveProperty("refreshedAt");
    expect(result).toHaveProperty("countriesRefreshed");
    expect(result.countriesRefreshed).toBe(1);
    expect(["world_bank_live", "world_bank_cache", "snapshot"]).toContain(result.dataSource);
    expect(result.series).toBeInstanceOf(Array);
  });
});
