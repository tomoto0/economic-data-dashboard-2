import { useState, useMemo } from "react";
import { Streamdown } from "streamdown";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Bot,
  BrainCircuit,
  CheckCircle2,
  Clock,
  Database,
  ExternalLink,
  Globe2,
  Loader2,
  RefreshCw,
  Sparkles,
  TrendingUp,
  Wifi,
  WifiOff,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";

const COUNTRY_COLORS: Record<string, string> = {
  US: "#22d3ee",
  CN: "#f97316",
  JP: "#a78bfa",
  DE: "#34d399",
  GB: "#60a5fa",
  FR: "#f472b6",
  IN: "#facc15",
  IT: "#fb7185",
  BR: "#4ade80",
  CA: "#38bdf8",
};

const DEFAULT_COUNTRIES = ["US", "CN", "JP", "DE", "GB"];

type ViewName = "overview" | "explorer" | "comparison" | "insights" | "legacy";
type DataSource = "world_bank_live" | "world_bank_cache" | "snapshot";

function formatValue(value: number | null | undefined, format = "number") {
  if (value === null || value === undefined || Number.isNaN(value)) return "N/A";
  if (format === "currency") {
    const abs = Math.abs(value);
    if (abs >= 1_000_000_000_000) return `$${(value / 1_000_000_000_000).toFixed(2)}T`;
    if (abs >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(2)}B`;
    if (abs >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
    return `$${value.toLocaleString()}`;
  }
  if (format === "integer") return Math.round(value).toLocaleString();
  if (format === "percent") return `${value.toFixed(2)}%`;
  return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function AxisTick({ x, y, payload }: any) {
  return <text x={x} y={y + 12} textAnchor="middle" fill="#94a3b8" fontSize={11}>{payload.value}</text>;
}

function ChartTooltip({ active, payload, label, format }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-2xl border border-white/10 bg-slate-950/95 p-3 text-sm shadow-2xl backdrop-blur">
      <p className="mb-2 font-semibold text-white">{label}</p>
      <div className="space-y-1">
        {payload.map((entry: any) => (
          <div key={entry.dataKey} className="flex items-center gap-2 text-slate-200">
            <span className="h-2 w-2 rounded-full" style={{ background: entry.color }} />
            <span className="min-w-10">{entry.dataKey}</span>
            <span className="font-medium text-white">{formatValue(entry.value, format)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Badge showing the data source origin with appropriate color and icon */
function DataSourceBadge({ dataSource, fetchedAt }: { dataSource?: DataSource; fetchedAt?: Date | string | null }) {
  if (!dataSource) return null;

  const config: Record<DataSource, { label: string; icon: React.ReactNode; className: string }> = {
    world_bank_live: {
      label: "Live · World Bank",
      icon: <Wifi className="h-3 w-3" />,
      className: "border-emerald-400/30 bg-emerald-400/10 text-emerald-200",
    },
    world_bank_cache: {
      label: "Cached · World Bank",
      icon: <CheckCircle2 className="h-3 w-3" />,
      className: "border-cyan-400/30 bg-cyan-400/10 text-cyan-200",
    },
    snapshot: {
      label: "Snapshot · CSV",
      icon: <Database className="h-3 w-3" />,
      className: "border-slate-400/30 bg-slate-400/10 text-slate-300",
    },
  };

  const { label, icon, className } = config[dataSource];
  const ts = fetchedAt ? new Date(fetchedAt as string) : null;
  const timeStr = ts && !Number.isNaN(ts.getTime()) ? ts.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : null;

  return (
    <div className="flex items-center gap-2">
      <Badge variant="outline" className={`flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium ${className}`}>
        {icon}
        {label}
      </Badge>
      {timeStr && (
        <span className="flex items-center gap-1 text-xs text-slate-400">
          <Clock className="h-3 w-3" />
          {timeStr}
        </span>
      )}
    </div>
  );
}

function FilterPanel({ catalog, countries, setCountries, indicator, setIndicator, yearStart, setYearStart, yearEnd, setYearEnd }: any) {
  return (
    <Card className="border-white/10 bg-white/[0.04] text-white shadow-2xl backdrop-blur-xl">
      <CardHeader>
        <CardTitle className="text-lg">Data controls</CardTitle>
        <CardDescription className="text-slate-400">Filter by country, indicator, and year range.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div>
          <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.2em] text-cyan-200">Indicator</label>
          <select value={indicator} onChange={event => setIndicator(event.target.value)} className="w-full rounded-xl border border-white/10 bg-slate-950/80 px-3 py-2 text-sm text-white outline-none ring-cyan-300/30 focus:ring-4">
            {catalog?.indicators?.map((item: any) => <option key={item.key} value={item.key}>{item.label}</option>)}
          </select>
        </div>
        <div>
          <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.2em] text-cyan-200">Countries</label>
          <div className="grid grid-cols-2 gap-2">
            {catalog?.countries?.map((country: any) => {
              const active = countries.includes(country.code);
              return (
                <button key={country.code} onClick={() => setCountries((current: string[]) => active ? current.filter(code => code !== country.code) : [...current, country.code].slice(-10))} className={`rounded-xl border px-3 py-2 text-left text-sm transition ${active ? "border-cyan-300/50 bg-cyan-300/15 text-cyan-50" : "border-white/10 bg-white/[0.03] text-slate-300 hover:bg-white/[0.07]"}`}>
                  <span className="font-semibold">{country.code}</span> <span className="text-xs opacity-70">{country.name}</span>
                </button>
              );
            })}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.2em] text-cyan-200">Start</label>
            <input type="number" value={yearStart} min={2000} max={2026} onChange={event => setYearStart(Number(event.target.value))} className="w-full rounded-xl border border-white/10 bg-slate-950/80 px-3 py-2 text-sm text-white outline-none ring-cyan-300/30 focus:ring-4" />
          </div>
          <div>
            <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.2em] text-cyan-200">End</label>
            <input type="number" value={yearEnd} min={2000} max={2026} onChange={event => setYearEnd(Number(event.target.value))} className="w-full rounded-xl border border-white/10 bg-slate-950/80 px-3 py-2 text-sm text-white outline-none ring-cyan-300/30 focus:ring-4" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function Home({ view = "overview" }: { view?: ViewName }) {
  const [countries, setCountries] = useState<string[]>(DEFAULT_COUNTRIES);
  const [indicator, setIndicator] = useState("gdp");
  const [yearStart, setYearStart] = useState(2000);
  const [yearEnd, setYearEnd] = useState(2026);

  const queryInput = useMemo(() => ({ countries: countries.length ? countries : ["US"], indicator, yearStart, yearEnd }), [countries, indicator, yearStart, yearEnd]);
  const catalog = trpc.economic.catalog.useQuery();
  const chart = trpc.economic.chartData.useQuery(queryInput);
  const comparison = trpc.economic.comparison.useQuery({ countries: countries.length ? countries : DEFAULT_COUNTRIES });
  const insight = trpc.economic.insight.useMutation();
  const utils = trpc.useUtils();

  const refreshMutation = trpc.economic.refreshData.useMutation({
    onSuccess: (data) => {
      // Invalidate the chart query so it re-fetches the fresh data from cache
      utils.economic.chartData.invalidate(queryInput);
      utils.economic.comparison.invalidate();
      toast.success(`Refreshed ${data.countriesRefreshed} country/countries from World Bank API`, {
        description: `Data source: ${data.dataSource} · ${data.series?.length ?? 0} data points`,
      });
    },
    onError: (error) => {
      toast.error("Refresh failed", { description: error.message });
    },
  });

  const selectedIndicator = chart.data?.indicator;
  const latestYear = chart.data?.series?.at(-1)?.year ?? yearEnd;
  const latestValues = chart.data?.countries?.map((country: any) => ({
    ...country,
    value: chart.data?.series?.at(-1)?.[country.code] as number | null | undefined,
  })) ?? [];

  const runInsight = () => insight.mutate(queryInput);
  const runRefresh = () => refreshMutation.mutate(queryInput);

  const dataSource = chart.data?.dataSource as DataSource | undefined;
  const fetchedAt = chart.data?.fetchedAt;

  return (
    <div className="min-h-screen p-4 sm:p-6 lg:p-8">
      <header className="mb-8 overflow-hidden rounded-[2rem] border border-white/10 bg-white/[0.05] p-6 shadow-2xl backdrop-blur-xl lg:p-8">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <Badge className="mb-4 border-cyan-300/30 bg-cyan-300/10 text-cyan-100" variant="outline">Full-stack economic intelligence</Badge>
            <h1 className="text-3xl font-semibold tracking-tight text-white sm:text-5xl">Global Economic Data Dashboard</h1>
            <p className="mt-4 text-base leading-7 text-slate-300 sm:text-lg">A Manus-powered dashboard that fetches live data from the World Bank Open Data API with a 24-hour cache, Database-backed snapshots, tRPC APIs, Recharts visual analytics, and AI-generated economic summaries.</p>
          </div>
          <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4 lg:min-w-[520px]">
            <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-4"><p className="text-slate-400">Countries</p><p className="mt-2 text-2xl font-semibold text-white">10</p></div>
            <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-4"><p className="text-slate-400">Indicators</p><p className="mt-2 text-2xl font-semibold text-white">6</p></div>
            <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-4"><p className="text-slate-400">Years</p><p className="mt-2 text-2xl font-semibold text-white">2000–2026</p></div>
            <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-4"><p className="text-slate-400">Records</p><p className="mt-2 text-2xl font-semibold text-white">{catalog.data?.recordCount ?? "—"}</p></div>
          </div>
        </div>
      </header>

      {view === "legacy" ? (
        <Card className="overflow-hidden border-white/10 bg-white/[0.04] text-white shadow-2xl backdrop-blur-xl">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Globe2 className="h-5 w-5 text-cyan-200" /> Preserved legacy dashboard</CardTitle>
            <CardDescription className="text-slate-400">The original Chart.js dashboard logic is retained as a static legacy entry point.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-3">
              <Button asChild className="bg-cyan-300 text-slate-950 hover:bg-cyan-200"><a href="/legacy/modern-dashboard-simple.html" target="_blank" rel="noreferrer">Open legacy dashboard <ExternalLink className="ml-2 h-4 w-4" /></a></Button>
              <Button asChild variant="outline" className="border-white/10 bg-white/5 text-white hover:bg-white/10"><a href="/legacy/economic_data.csv" target="_blank" rel="noreferrer">View original CSV</a></Button>
            </div>
            <iframe title="Legacy dashboard" src="/legacy/modern-dashboard-simple.html" className="h-[720px] w-full rounded-2xl border border-white/10 bg-white" />
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-6 xl:grid-cols-[360px_1fr]">
          <aside className="space-y-6">
            <FilterPanel catalog={catalog.data} countries={countries} setCountries={setCountries} indicator={indicator} setIndicator={setIndicator} yearStart={yearStart} setYearStart={setYearStart} yearEnd={yearEnd} setYearEnd={setYearEnd} />

            {/* Data source status card */}
            <Card className="border-white/10 bg-white/[0.04] text-white shadow-2xl backdrop-blur-xl">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  {dataSource === "world_bank_live" ? <Wifi className="h-5 w-5 text-emerald-300" /> : dataSource === "world_bank_cache" ? <CheckCircle2 className="h-5 w-5 text-cyan-300" /> : <Database className="h-5 w-5 text-slate-400" />}
                  Data source
                </CardTitle>
                <CardDescription className="text-slate-400">Where the current chart data originates.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 text-sm text-slate-300">
                <DataSourceBadge dataSource={dataSource} fetchedAt={fetchedAt as any} />

                <div className="space-y-1.5 text-xs text-slate-400">
                  {dataSource === "world_bank_live" && <p className="text-emerald-300">✓ Just fetched fresh from World Bank API</p>}
                  {dataSource === "world_bank_cache" && <p className="text-cyan-300">✓ Served from 24-hour API cache</p>}
                  {dataSource === "snapshot" && <p className="text-slate-400">⚠ World Bank API unavailable — showing CSV snapshot</p>}
                  <p>Cache TTL: 24 hours per country/indicator</p>
                </div>

                <Button
                  onClick={runRefresh}
                  disabled={refreshMutation.isPending || chart.isFetching}
                  variant="outline"
                  className="w-full border-white/10 bg-white/5 text-white hover:bg-white/10"
                >
                  {refreshMutation.isPending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCw className="mr-2 h-4 w-4" />
                  )}
                  Force refresh from World Bank
                </Button>
                <p className="text-xs text-slate-500">Clears the cache and re-fetches live data for the selected countries and indicator.</p>
              </CardContent>
            </Card>

            <Card className="border-white/10 bg-white/[0.04] text-white shadow-2xl backdrop-blur-xl">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg"><Database className="h-5 w-5 text-cyan-200" /> Snapshot metadata</CardTitle>
                <CardDescription className="text-slate-400">Baseline CSV snapshot stored in Manus Database.</CardDescription>
              </CardHeader>
              <CardContent className="text-sm text-slate-300">
                <p>Source: <span className="text-white">{catalog.data?.snapshot?.source ?? "loading"}</span></p>
                <p>Records: <span className="text-white">{catalog.data?.snapshot?.recordCount ?? catalog.data?.recordCount ?? "—"}</span></p>
              </CardContent>
            </Card>
          </aside>

          <main className="space-y-6">
            <section className="grid gap-4 md:grid-cols-3">
              {latestValues.slice(0, 3).map((item: any) => (
                <Card key={item.code} className="border-white/10 bg-white/[0.04] text-white shadow-xl backdrop-blur-xl">
                  <CardHeader className="pb-2"><CardDescription className="text-slate-400">{item.name} · {latestYear}</CardDescription><CardTitle className="text-lg">{selectedIndicator?.label ?? "Indicator"}</CardTitle></CardHeader>
                  <CardContent><p className="text-2xl font-semibold text-cyan-100">{formatValue(item.value, selectedIndicator?.format)}</p></CardContent>
                </Card>
              ))}
            </section>

            {(view === "overview" || view === "explorer") && (
              <Card className="border-white/10 bg-white/[0.04] text-white shadow-2xl backdrop-blur-xl">
                <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <TrendingUp className="h-5 w-5 text-cyan-200" />
                      {selectedIndicator?.label ?? "Economic Indicator"}
                    </CardTitle>
                    <CardDescription className="mt-1 text-slate-400">Interactive Recharts visualization across selected countries.</CardDescription>
                  </div>
                  <div className="flex items-center gap-3">
                    <DataSourceBadge dataSource={dataSource} fetchedAt={fetchedAt as any} />
                    {chart.isFetching && <Loader2 className="h-4 w-4 animate-spin text-cyan-200" />}
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="h-[440px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={chart.data?.series ?? []} margin={{ top: 10, right: 24, left: 0, bottom: 0 }}>
                        <CartesianGrid stroke="rgba(148,163,184,0.18)" vertical={false} />
                        <XAxis dataKey="year" tick={<AxisTick />} tickLine={false} axisLine={false} />
                        <YAxis tick={{ fill: "#94a3b8", fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={(value) => formatValue(Number(value), selectedIndicator?.format).replace("$", "")} />
                        <Tooltip content={<ChartTooltip format={selectedIndicator?.format} />} />
                        <Legend />
                        {chart.data?.countries?.map((country: any) => <Line key={country.code} type="monotone" dataKey={country.code} stroke={COUNTRY_COLORS[country.code] ?? "#e2e8f0"} strokeWidth={3} dot={false} connectNulls />)}
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
            )}

            {(view === "overview" || view === "comparison") && (
              <Card className="border-white/10 bg-white/[0.04] text-white shadow-2xl backdrop-blur-xl">
                <CardHeader><CardTitle>Country comparison</CardTitle><CardDescription className="text-slate-400">Latest available KPI values by major indicator.</CardDescription></CardHeader>
                <CardContent className="grid gap-4 lg:grid-cols-2">
                  {comparison.data?.map((country: any) => (
                    <div key={country.countryCode} className="rounded-2xl border border-white/10 bg-slate-950/40 p-4">
                      <h3 className="mb-3 font-semibold text-white">{country.countryName}</h3>
                      <div className="grid gap-2 sm:grid-cols-2">
                        {country.kpis.map((kpi: any) => <div key={kpi.indicatorKey} className="rounded-xl bg-white/[0.04] p-3"><p className="text-xs text-slate-400">{kpi.label} · {kpi.year ?? "n/a"}</p><p className="mt-1 font-semibold text-cyan-100">{formatValue(kpi.value, kpi.format)}</p></div>)}
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            {(view === "overview" || view === "insights") && (
              <Card className="border-white/10 bg-white/[0.04] text-white shadow-2xl backdrop-blur-xl">
                <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div><CardTitle className="flex items-center gap-2"><BrainCircuit className="h-5 w-5 text-cyan-200" /> AI-powered insight</CardTitle><CardDescription className="text-slate-400">Generated server-side through the Manus LLM API from the selected data slice.</CardDescription></div>
                  <Button onClick={runInsight} disabled={insight.isPending} className="bg-cyan-300 text-slate-950 hover:bg-cyan-200">{insight.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}Generate insight</Button>
                </CardHeader>
                <CardContent>
                  <div className="prose prose-invert max-w-none rounded-2xl border border-white/10 bg-slate-950/50 p-5 text-slate-200">
                    {insight.data?.insight ? <Streamdown>{insight.data.insight}</Streamdown> : <p className="m-0 text-slate-400"><Bot className="mr-2 inline h-4 w-4" />Select countries and an indicator, then generate an evidence-grounded trend summary.</p>}
                  </div>
                  {insight.data && (
                    <div className="mt-3 flex items-center gap-3">
                      <DataSourceBadge dataSource={insight.data.dataSource as DataSource} />
                      <span className="text-xs text-slate-400">{insight.data.recordCount} records used</span>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {view === "explorer" && (
              <Card className="border-white/10 bg-white/[0.04] text-white shadow-2xl backdrop-blur-xl">
                <CardHeader><CardTitle>Distribution snapshot</CardTitle><CardDescription className="text-slate-400">Latest selected-year comparison rendered as a bar chart.</CardDescription></CardHeader>
                <CardContent><div className="h-[360px]"><ResponsiveContainer width="100%" height="100%"><BarChart data={latestValues}><CartesianGrid stroke="rgba(148,163,184,0.18)" vertical={false} /><XAxis dataKey="code" tick={{ fill: "#94a3b8" }} /><YAxis tick={{ fill: "#94a3b8", fontSize: 11 }} tickFormatter={(value) => formatValue(Number(value), selectedIndicator?.format).replace("$", "")} /><Tooltip content={<ChartTooltip format={selectedIndicator?.format} />} /><Bar dataKey="value" fill="#22d3ee" radius={[10, 10, 0, 0]} /></BarChart></ResponsiveContainer></div></CardContent>
              </Card>
            )}
          </main>
        </div>
      )}

      <Separator className="my-8 bg-white/10" />
      <footer className="flex flex-col gap-2 pb-6 text-sm text-slate-400 sm:flex-row sm:items-center sm:justify-between">
        <p>Original repository logic preserved under <span className="text-slate-200">/legacy</span>; new UI uses Recharts and tRPC.</p>
        <p className="flex items-center gap-2"><RefreshCw className="h-4 w-4" /> Live World Bank data fetched on demand · 24-hour TTL cache · CSV snapshot fallback.</p>
      </footer>
    </div>
  );
}
