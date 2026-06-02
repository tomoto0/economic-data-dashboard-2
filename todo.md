# Project TODO

- [x] Preserve all original repository files and legacy dashboard logic, including Chart.js charts, country selector, indicator switcher, summary cards, dark mode, and responsive layout.
- [x] Build the main application shell with a sidebar component named `DashboardLayout`.
- [x] Replace the raw HTML entry point with a polished React + Tailwind dashboard UI.
- [x] Make dark mode the default theme and provide a light/dark theme toggle.
- [x] Implement Recharts-based interactive charts for GDP, Population, Inflation, Unemployment, FDI, and Foreign Reserves.
- [x] Support data filtering by country, indicator, and year range.
- [x] Cover the 10 target countries: US, CN, JP, DE, GB, FR, IN, IT, BR, and CA.
- [x] Integrate Manus Database tables for economic data snapshots from `economic_data.csv`.
- [x] Integrate Manus Database caching for World Bank API fetch results with timestamps.
- [x] Serve chart-ready economic data via public tRPC procedures.
- [x] Add a country comparison view with side-by-side KPI cards for latest values across major indicators.
- [x] Integrate Manus LLM API to generate AI-powered economic insights and trend summaries based on selected indicator and countries.
- [x] Configure SEO and OGP meta tags with descriptive title, description, and social preview image.
- [x] Write Vitest tests for all tRPC API endpoints.
- [x] Run type checks, Vitest tests, and production build checks.
- [x] Save a final checkpoint and provide deployment handoff instructions.

## World Bank Live-Fetch Upgrade

- [x] Add `expiresAt` TTL column to `world_bank_cache` schema and migrate database.
- [x] Rewrite `getEconomicRecords` to fetch live from World Bank API first, falling back to DB snapshot only when API is unavailable.
- [x] Implement 24-hour TTL: skip live fetch if a valid unexpired cache entry exists; force-refresh on manual trigger.
- [x] Add `economic.refreshData` tRPC mutation that clears cache for the selected country/indicator and re-fetches from World Bank.
- [x] Update `economic.chartData` to return `dataSource` field ("world_bank_live" | "world_bank_cache" | "snapshot") and `fetchedAt` timestamp.
- [x] Update frontend to show data source badge (Live / Cached / Snapshot) with last-fetched timestamp.
- [x] Add manual refresh button to Explorer view that calls `economic.refreshData`.
- [x] Update snapshot metadata card to reflect live World Bank data when available.
- [x] Run tests, build, checkpoint.
