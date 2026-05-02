import { COOKIE_NAME } from "@shared/const";
import { z } from "zod";
import { getSessionCookieOptions } from "./_core/cookies";
import { invokeLLM } from "./_core/llm";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import {
  getCachedWorldBankResult,
  getCatalog,
  getEconomicRecords,
  getLatestKpis,
  getSnapshotMetadata,
  saveInsightRequest,
  saveWorldBankCache,
} from "./db";

const chartInput = z.object({
  countries: z.array(z.string()).min(1).max(10).default(["US", "CN", "JP"]),
  indicator: z.string().default("gdp"),
  yearStart: z.number().int().min(1960).max(2030).default(2000),
  yearEnd: z.number().int().min(1960).max(2030).default(2026),
});

const countriesInput = z.object({
  countries: z.array(z.string()).min(1).max(10).default(["US", "CN", "JP", "DE", "GB", "FR", "IN", "IT", "BR", "CA"]),
});

function formatChart(records: any[]) {
  const yearMap = new Map<number, Record<string, number | null>>();
  for (const record of records) {
    if (!yearMap.has(record.year)) yearMap.set(record.year, { year: record.year });
    yearMap.get(record.year)![record.countryCode] = record.value ?? null;
  }
  const series = Array.from(yearMap.values()).sort((a, b) => Number(a.year) - Number(b.year));
  const countries = Array.from(new Map(records.map(record => [record.countryCode, { code: record.countryCode, name: record.countryName, iso3: record.countryIso3 }])).values());
  const first = records[0];
  return {
    series,
    countries,
    indicator: first ? {
      key: first.indicatorKey,
      label: first.indicatorLabel,
      unit: first.unit,
      format: first.valueFormat ?? first.format,
      worldBankCode: first.worldBankCode,
    } : null,
    raw: records,
  };
}

async function fetchWorldBank(countryCode: string, indicatorKey: string, yearStart: number, yearEnd: number) {
  const catalog = getCatalog();
  const indicator = catalog.indicators.find(item => item.key === indicatorKey);
  if (!indicator) throw new Error(`Unknown indicator: ${indicatorKey}`);
  const country = catalog.countries.find(item => item.code === countryCode || item.iso3 === countryCode);
  const wbCountry = country?.iso3 ?? countryCode;
  const cacheKey = `${wbCountry}:${indicator.worldBankCode}:${yearStart}:${yearEnd}`;
  const cached = await getCachedWorldBankResult(cacheKey);
  if (cached) return { source: "cache" as const, fetchedAt: cached.fetchedAt, payload: JSON.parse(cached.payload) };

  const url = `https://api.worldbank.org/v2/country/${wbCountry}/indicator/${indicator.worldBankCode}?format=json&per_page=100&date=${yearStart}:${yearEnd}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`World Bank API returned ${response.status}`);
  const payload = await response.json();
  await saveWorldBankCache({
    cacheKey,
    countryCode: wbCountry,
    indicatorKey,
    yearStart,
    yearEnd,
    payload: JSON.stringify(payload),
  });
  return { source: "world_bank" as const, fetchedAt: new Date(), payload };
}

function fallbackInsight(records: any[], indicator: string, countries: string[]) {
  const latestRows = countries.map(countryCode => {
    const series = records.filter(record => record.countryCode === countryCode && record.value !== null).sort((a, b) => b.year - a.year);
    const latest = series[0];
    const previous = series[1];
    const trend = latest && previous && latest.value !== null && previous.value !== null ? latest.value - previous.value : null;
    return `${latest?.countryName ?? countryCode}: latest ${latest?.year ?? "n/a"} value ${latest?.value ?? "n/a"}${trend === null ? "" : `, one-period change ${trend}`}`;
  }).join("\n");
  return `### AI Insight Draft\n\nThe selected **${indicator}** dataset covers ${countries.length} countries. The latest available readings are:\n\n${latestRows}\n\nInterpretation should focus on relative direction, latest data availability, and outliers. The live LLM service was unavailable during this request, so this deterministic summary was returned instead.`;
}

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),

  economic: router({
    catalog: publicProcedure.query(async () => {
      const snapshot = await getSnapshotMetadata();
      return { ...getCatalog(), snapshot };
    }),

    chartData: publicProcedure.input(chartInput).query(async ({ input }) => {
      const normalizedYearStart = Math.min(input.yearStart, input.yearEnd);
      const normalizedYearEnd = Math.max(input.yearStart, input.yearEnd);
      const records = await getEconomicRecords({
        countries: input.countries,
        indicator: input.indicator,
        yearStart: normalizedYearStart,
        yearEnd: normalizedYearEnd,
      });
      return formatChart(records);
    }),

    comparison: publicProcedure.input(countriesInput).query(async ({ input }) => {
      return getLatestKpis(input.countries);
    }),

    worldBank: publicProcedure.input(chartInput.extend({ country: z.string().default("US") })).query(async ({ input }) => {
      return fetchWorldBank(input.country, input.indicator, input.yearStart, input.yearEnd);
    }),

    insight: publicProcedure.input(chartInput).mutation(async ({ input }) => {
      const records = await getEconomicRecords(input);
      const chart = formatChart(records);
      const prompt = `Analyze the selected economic indicator for a global dashboard. Indicator: ${input.indicator}. Countries: ${input.countries.join(", ")}. Years: ${input.yearStart}-${input.yearEnd}. Use concise markdown with: overview, notable leaders/laggards, trend interpretation, and caution about missing or lagged World Bank observations. Data JSON: ${JSON.stringify(chart.series.slice(-8))}`;
      let responseText = "";
      try {
        const response: any = await invokeLLM({
          messages: [
            { role: "system", content: "You are an economic analyst. Return concise, evidence-grounded markdown for a dashboard. Avoid investment advice and state uncertainty clearly." },
            { role: "user", content: prompt },
          ],
        });
        responseText = response?.choices?.[0]?.message?.content ?? response?.content ?? "";
      } catch (error) {
        console.warn("[LLM] Insight generation failed; returning deterministic fallback:", error);
      }
      if (!responseText) responseText = fallbackInsight(records, input.indicator, input.countries);
      await saveInsightRequest({
        indicatorKey: input.indicator,
        countryCodes: input.countries.join(","),
        yearStart: input.yearStart,
        yearEnd: input.yearEnd,
        prompt,
        response: responseText,
      });
      return { insight: responseText, generatedAt: new Date(), recordCount: records.length };
    }),
  }),
});

export type AppRouter = typeof appRouter;
