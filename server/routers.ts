import { COOKIE_NAME } from "@shared/const";
import { z } from "zod";
import { getSessionCookieOptions } from "./_core/cookies";
import { invokeLLM } from "./_core/llm";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import {
  getCatalog,
  getEconomicRecords,
  getLatestKpis,
  getSnapshotMetadata,
  invalidateWorldBankCache,
  saveInsightRequest,
} from "./db";
import { economicDataPayload } from "./data/economicData";

const chartInput = z.object({
  countries: z.array(z.string()).min(1).max(10).default(["US", "CN", "JP"]),
  indicator: z.string().default("gdp"),
  yearStart: z.number().int().min(1960).max(2030).default(2000),
  yearEnd: z.number().int().min(1960).max(2030).default(new Date().getFullYear()),
});

const countriesInput = z.object({
  countries: z.array(z.string()).min(1).max(10).default(["US", "CN", "JP", "DE", "GB", "FR", "IN", "IT", "BR", "CA"]),
});

function formatChart(records: any[], dataSource: string, fetchedAt: Date | null) {
  const yearMap = new Map<number, Record<string, number | null>>();
  for (const record of records) {
    if (!yearMap.has(record.year)) yearMap.set(record.year, { year: record.year });
    yearMap.get(record.year)![record.countryCode] = record.value ?? null;
  }
  const series = Array.from(yearMap.values()).sort((a, b) => Number(a.year) - Number(b.year));
  const countries = Array.from(
    new Map(records.map(r => [r.countryCode, { code: r.countryCode, name: r.countryName, iso3: r.countryIso3 }])).values(),
  );
  const first = records[0];
  return {
    series,
    countries,
    indicator: first
      ? {
          key: first.indicatorKey,
          label: first.indicatorLabel,
          unit: first.unit,
          format: first.valueFormat ?? first.format,
          worldBankCode: first.worldBankCode,
        }
      : null,
    dataSource,
    fetchedAt,
    raw: records,
  };
}

function fallbackInsight(records: any[], indicator: string, countries: string[]) {
  const latestRows = countries.map(countryCode => {
    const series = records
      .filter(r => r.countryCode === countryCode && r.value !== null)
      .sort((a: any, b: any) => b.year - a.year);
    const latest = series[0];
    const previous = series[1];
    const trend =
      latest && previous && latest.value !== null && previous.value !== null
        ? latest.value - previous.value
        : null;
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

    /** Main chart data — World Bank API first, 24-hour cache, snapshot fallback */
    chartData: publicProcedure.input(chartInput).query(async ({ input }) => {
      const yearStart = Math.min(input.yearStart, input.yearEnd);
      const yearEnd = Math.max(input.yearStart, input.yearEnd);
      const result = await getEconomicRecords({
        countries: input.countries,
        indicator: input.indicator,
        yearStart,
        yearEnd,
      });
      return formatChart(result.records, result.dataSource, result.fetchedAt);
    }),

    /** Country comparison KPIs — also uses live data pipeline */
    comparison: publicProcedure.input(countriesInput).query(async ({ input }) => {
      return getLatestKpis(input.countries);
    }),

    /**
     * Force-refresh: invalidate the cache for the given country+indicator
     * and immediately re-fetch from the World Bank API.
     */
    refreshData: publicProcedure
      .input(
        z.object({
          countries: z.array(z.string()).min(1).max(10),
          indicator: z.string(),
          yearStart: z.number().int().min(1960).max(2030).default(2000),
          yearEnd: z.number().int().min(1960).max(2030).default(new Date().getFullYear()),
        }),
      )
      .mutation(async ({ input }) => {
        // Invalidate cache for each requested country
        for (const countryCode of input.countries) {
          const country = economicDataPayload.countries.find(c => c.code === countryCode);
          if (country) {
            await invalidateWorldBankCache(country.iso3, input.indicator);
          }
        }
        // Re-fetch with empty cache
        const result = await getEconomicRecords({
          countries: input.countries,
          indicator: input.indicator,
          yearStart: input.yearStart,
          yearEnd: input.yearEnd,
        });
        return {
          ...formatChart(result.records, result.dataSource, result.fetchedAt),
          refreshedAt: new Date(),
          countriesRefreshed: input.countries.length,
        };
      }),

    /** AI-powered trend insight */
    insight: publicProcedure.input(chartInput).mutation(async ({ input }) => {
      const result = await getEconomicRecords(input);
      const chart = formatChart(result.records, result.dataSource, result.fetchedAt);
      const prompt = `Analyze the selected economic indicator for a global dashboard. Indicator: ${input.indicator}. Countries: ${input.countries.join(", ")}. Years: ${input.yearStart}-${input.yearEnd}. Data source: ${result.dataSource}. Use concise markdown with: overview, notable leaders/laggards, trend interpretation, and caution about missing or lagged World Bank observations. Data JSON: ${JSON.stringify(chart.series.slice(-8))}`;
      let responseText = "";
      try {
        const response: any = await invokeLLM({
          messages: [
            {
              role: "system",
              content:
                "You are an economic analyst. Return concise, evidence-grounded markdown for a dashboard. Avoid investment advice and state uncertainty clearly.",
            },
            { role: "user", content: prompt },
          ],
        });
        responseText = response?.choices?.[0]?.message?.content ?? response?.content ?? "";
      } catch (error) {
        console.warn("[LLM] Insight generation failed; returning deterministic fallback:", error);
      }
      if (!responseText) responseText = fallbackInsight(result.records, input.indicator, input.countries);
      await saveInsightRequest({
        indicatorKey: input.indicator,
        countryCodes: input.countries.join(","),
        yearStart: input.yearStart,
        yearEnd: input.yearEnd,
        prompt,
        response: responseText,
      });
      return {
        insight: responseText,
        generatedAt: new Date(),
        recordCount: result.records.length,
        dataSource: result.dataSource,
      };
    }),
  }),
});

export type AppRouter = typeof appRouter;
