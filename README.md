![Global Economic Data Dashboard](https://d2xsxph8kpxj0f.cloudfront.net/310419663027084947/byEw2FDkgQS7rnYKQtfyLH/ogp-economic-dashboard-QepdcoctRuVU3o739aku8C.png)

# Global Economic Data Dashboard

> **Live URL: [https://dashboard-econ.manus.space](https://dashboard-econ.manus.space)**

A full-stack, AI-powered economic intelligence platform built on [Manus Platform](https://manus.im), powered by [World Bank Open Data](https://data.worldbank.org/). It visualises GDP, population, inflation, unemployment, FDI, and foreign reserves across 10 major economies from 2000 to the present, with live data fetching, a 24-hour TTL cache, Manus Database-backed snapshots, and AI-generated trend summaries.

---

## Features

| Category | Details |
|---|---|
| **Live Data** | Fetches directly from the World Bank Open Data API on every request; 24-hour TTL cache stored in Manus Database |
| **Data Source Badge** | Every chart shows whether data is `Live`, `Cached`, or `Snapshot` with a last-fetched timestamp |
| **Manual Refresh** | One-click refresh button forces a cache-clear and re-fetches the latest figures from World Bank |
| **6 Indicators** | GDP (current USD), Population, Inflation (CPI %), Unemployment (%), FDI net inflows, Foreign Reserves |
| **10 Countries** | United States, China, Japan, Germany, United Kingdom, France, India, Italy, Brazil, Canada |
| **Year Range** | 2000 – present (configurable slider) |
| **Interactive Charts** | Recharts line charts with multi-country overlay, tooltips, and responsive layout |
| **Country Comparison** | Side-by-side KPI cards showing the latest value for every indicator per country |
| **AI Insights** | Manus LLM generates a markdown-formatted trend summary for the currently selected indicator and countries |
| **Legacy Dashboard** | Original Chart.js dashboard preserved in the Legacy tab for reference |
| **Dark / Light Theme** | Dark-first design (deep navy) with a one-click light mode toggle |
| **SEO & OGP** | Full Open Graph, Twitter Card, JSON-LD structured data, and `ja_JP` / `en_US` locale tags |

---

## Architecture

```
client/                     React 19 + Tailwind 4 + Recharts
  src/
    pages/Home.tsx          Main dashboard (Overview, Explorer, Comparison, AI Insights, Legacy)
    components/
      DashboardLayout.tsx   Sidebar shell with nav, theme toggle, data-source badge
server/
  routers.ts                tRPC procedures (economic.chartData, comparison, insight, refreshData, catalog)
  db.ts                     World Bank API fetch + 24-hour TTL cache + CSV snapshot fallback
  _core/llm.ts              Manus LLM helper (invokeLLM)
drizzle/
  schema.ts                 MySQL schema: economic_records, world_bank_cache, ai_insights, snapshots
```

The server follows a **three-tier data strategy**:

1. **World Bank Live** — fetches `https://api.worldbank.org/v2/country/{iso3}/indicator/{code}` for each country/indicator pair.
2. **World Bank Cache** — if a valid cache entry exists in `world_bank_cache` with `expiresAt > NOW()`, the cached payload is returned immediately (no external call).
3. **CSV Snapshot** — if the World Bank API is unreachable, the pre-seeded `economic_records` table (sourced from `economic_data.csv`) is used as a fallback.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 19, Tailwind CSS 4, Recharts, shadcn/ui, Wouter |
| Backend | Express 4, tRPC 11, Drizzle ORM, MySQL (Manus Database) |
| AI | Manus LLM API (`invokeLLM`) |
| Data | World Bank Open Data REST API v2 |
| Build | Vite 7, esbuild, TypeScript 5.9 |
| Testing | Vitest 2 (8 tests, 100% pass) |
| Hosting | Manus Platform (Cloud Run, auto-scaling) |

---

## tRPC API Reference

| Procedure | Type | Description |
|---|---|---|
| `economic.catalog` | query | Returns supported countries, indicators, record count, and year range |
| `economic.chartData` | query | Returns chart-ready series filtered by country, indicator, and year range; includes `dataSource` and `fetchedAt` |
| `economic.comparison` | query | Returns latest KPI values for all indicators per selected country |
| `economic.insight` | query | Calls Manus LLM to generate a markdown trend summary |
| `economic.refreshData` | mutation | Clears the World Bank cache and re-fetches live data for the selected country/indicator |

---

## Getting Started (Local Development)

```bash
# 1. Clone
git clone https://github.com/tomoto0/economic-data-dashboard
cd economic-data-dashboard-manus

# 2. Install dependencies
pnpm install

# 3. Set environment variables (copy from Manus project secrets)
cp .env.example .env

# 4. Run database migrations
pnpm drizzle-kit generate && pnpm drizzle-kit migrate

# 5. Start dev server
pnpm dev
```

The dev server starts at `http://localhost:3000`.

---

## Data Sources

- **[World Bank Open Data](https://data.worldbank.org/)** — GDP (`NY.GDP.MKTP.CD`), Population (`SP.POP.TOTL`), Inflation (`FP.CPI.TOTL.ZG`), Unemployment (`SL.UEM.TOTL.ZS`), FDI (`BX.KLT.DINV.CD.WD`), Foreign Reserves (`FI.RES.TOTL.CD`)
- **`economic_data.csv`** — baseline snapshot (1,620 records) used as fallback when the World Bank API is unavailable

---

## OGP / Social Sharing

The application is configured with comprehensive social meta tags for all major platforms:

| Platform | Tag / Standard |
|---|---|
| **Facebook / LINE / general SNS** | `og:type`, `og:title`, `og:description`, `og:image`, `og:locale: ja_JP`, `og:locale:alternate: en_US` |
| **Twitter / X** | `twitter:card: summary_large_image`, `twitter:title`, `twitter:description`, `twitter:image` |
| **SEO** | `<title>`, `meta[name=description]`, `link[rel=canonical]`, `meta[name=robots]` |
| **Structured Data** | JSON-LD `WebApplication` schema |

---

## Development Commands

| Command | Purpose |
|---|---|
| `pnpm dev` | Run the local development server |
| `pnpm test` | Run Vitest (8 tests) |
| `pnpm check` | TypeScript type check |
| `pnpm build` | Production build (Vite + esbuild) |
| `pnpm drizzle-kit generate` | Generate SQL migrations from schema changes |
| `pnpm drizzle-kit migrate` | Apply migrations to the database |

---

## License

MIT © 2025 — built with [Manus Platform](https://manus.im)

[1]: https://data.worldbank.org/ "World Bank Open Data"
[2]: https://recharts.org/en-US/ "Recharts Documentation"
[3]: https://trpc.io/ "tRPC Documentation"
[4]: https://www.chartjs.org/ "Chart.js Documentation"
