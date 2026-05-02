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

  it("filters chart-ready data by country, indicator, and year range", async () => {
    const caller = appRouter.createCaller(createPublicContext());

    const result = await caller.economic.chartData({ countries: ["US", "JP"], indicator: "gdp", yearStart: 2018, yearEnd: 2020 });

    expect(result.indicator?.key).toBe("gdp");
    expect(result.countries.map(country => country.code).sort()).toEqual(["JP", "US"]);
    expect(result.series).toHaveLength(3);
    expect(result.series[0]?.year).toBe(2018);
    expect(result.series.at(-1)?.year).toBe(2020);
    expect(result.raw.every(record => ["US", "JP"].includes(record.countryCode) && record.indicatorKey === "gdp")).toBe(true);
  });

  it("returns latest comparison KPI cards for selected countries", async () => {
    const caller = appRouter.createCaller(createPublicContext());

    const comparison = await caller.economic.comparison({ countries: ["US", "CN"] });

    expect(comparison).toHaveLength(2);
    expect(comparison[0]?.kpis.map(kpi => kpi.indicatorKey)).toEqual(expect.arrayContaining(["gdp", "population", "inflation", "unemployment", "fdi", "reserves"]));
    expect(comparison[0]?.kpis[0]?.year).toBeGreaterThanOrEqual(2000);
  });

  it("fetches and shapes a World Bank response when cache is unavailable", async () => {
    const caller = appRouter.createCaller(createPublicContext());
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => [{ page: 1 }, [{ countryiso3code: "USA", date: "2020", value: 21000000000000 }]],
    }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await caller.economic.worldBank({ countries: ["US"], country: "US", indicator: "gdp", yearStart: 2020, yearEnd: 2020 });

    expect(result.source).toBe("world_bank");
    expect(result.payload[1][0].countryiso3code).toBe("USA");
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("api.worldbank.org"));
    vi.unstubAllGlobals();
  });

  it("generates and returns AI insight markdown for the selected data slice", async () => {
    const caller = appRouter.createCaller(createPublicContext());

    const result = await caller.economic.insight({ countries: ["US", "CN"], indicator: "inflation", yearStart: 2019, yearEnd: 2022 });

    expect(result.recordCount).toBeGreaterThan(0);
    expect(result.insight).toContain("Summary");
    expect(result.generatedAt).toBeInstanceOf(Date);
  });
});
