# FACTORY.md — Mission Control

## [MISSION-001] Wire Mission Control to Real Data
**Added by:** Apple
**Priority:** High
**Description:** Go through every page of Mission Control and replace all hardcoded/filler data with live data from real sources. Every number, status, and metric shown should reflect reality.

---

### [TASK-001] Home page — Agent cards: replace hardcoded props with live data
**Added by:** Code Factory (from audit)
**Risk:** Medium
**Description:** In `src/app/page.tsx`, the three AgentCard components have hardcoded props: model names ("Opus 4.6" — wrong, Ari uses Sonnet 4.6), uptime percentages ("99.2%", "98.7%", "97.8%" — fabricated), and lastActivity ("2 mins ago", "5 mins ago", "8 mins ago" — static strings). Create an API route `/api/agents` that reads real agent status from OpenClaw (via `openclaw status` or the gateway API at localhost), and fetch it client-side. If live status isn't available, at minimum fix the model names: Ari=Sonnet 4.6, Arlo=Sonnet 4, Axel=Sonnet 4. Remove fake uptime numbers — show "—" if no real data exists rather than fabricated percentages.
**Files:** `src/app/page.tsx`, `src/app/components/AgentCard.tsx`, new `src/app/api/agents/route.ts`
**Success looks like:** Agent cards show accurate model names and no fabricated uptime/activity data.
**Status:** Pending

---

### [TASK-002] Home page — HealthSummary: replace hardcoded cron health numbers
**Added by:** Code Factory (from audit)
**Risk:** Low
**Description:** In `src/app/components/HealthSummary.tsx`, the values `cronHealthy = 32`, `cronTotal = 66`, `cronErrors = 18`, `cronIdle = 16` are hardcoded constants. These should be computed from the actual cron data already available in `src/app/crons/real-cron-data.ts` — count jobs by lastStatus (success=healthy, error=error, and determine idle from consecutiveErrors or lastRun). Import `realCronJobs` and compute counts dynamically.
**Files:** `src/app/components/HealthSummary.tsx`
**Success looks like:** Health summary numbers match the actual cron data on the Crons page.
**Status:** Pending

---

### [TASK-003] Home page — PipelineStats: replace hardcoded stats
**Added by:** Code Factory (from audit)
**Risk:** Low
**Description:** In `src/app/components/PipelineStats.tsx`, all four stats are hardcoded: Channels "41,821" (real is 42,214), Videos "1.83M" (real is 2,178,548), Brands "12,847" (real is 38,987), Active Deals "328" (fabricated). The percentage changes ("+2.3%", "+5.7%", etc.) are also fabricated. Either fetch from the same data source as the pipeline page, or import the pipeline page's `topStats` array. Remove fake percentage changes — show nothing or "—" if we can't compute real deltas. Fix "Brands Matched" to show the real count of 38,987. "Active Deals" should either pull from Copper API or be removed entirely.
**Files:** `src/app/components/PipelineStats.tsx`
**Success looks like:** Pipeline stats on home page match pipeline page numbers exactly. No fabricated percentages.
**Status:** Pending

---

### [TASK-004] Home page — RecentCronActivity: replace hardcoded recent runs
**Added by:** Code Factory (from audit)
**Risk:** Low
**Description:** In `src/app/components/RecentCronActivity.tsx`, the `recentRuns` array is completely hardcoded with fake data (e.g., "fathom-pipeline-checker ran 8m ago"). This should pull from the same real cron data in `real-cron-data.ts` — sort by `lastRun` to show the 10 most recent, and use the real `lastStatus`, `duration`, and `agent` fields.
**Files:** `src/app/components/RecentCronActivity.tsx`
**Success looks like:** Recent cron runs table shows actual recent runs matching the Crons page data.
**Status:** Pending

---

### [TASK-005] Agents page — Replace hardcoded agent stats and mock standup data
**Added by:** Code Factory (from audit)
**Risk:** Medium
**Description:** In `src/app/agents/page.tsx`, multiple data issues: (1) Agent stats are hardcoded — cronJobsManaged counts, successRate, avgResponseTime, memoryUsage are all fabricated. Compute cronJobsManaged and successRate from `realCronJobs` by filtering on agent name. Remove avgResponseTime and memoryUsage if we can't source them. (2) `mockStandupData` is completely fake with date "2026-02-19" and fabricated standup items. Either fetch real standup data from an API or show "No standup data available" rather than fake data. (3) `pastStandupDates` is a hardcoded array of fake dates with no click functionality. (4) Model listed as "Opus 4.6" for Ari — should be "Sonnet 4.6". (5) Uptime percentages are fabricated.
**Files:** `src/app/agents/page.tsx`
**Success looks like:** Agent stats computed from real cron data. Standup shows real or no data. No fabricated numbers.
**Status:** Pending

---

### [TASK-006] Pipeline page — Replace hardcoded topStats and stage stats
**Added by:** Code Factory (from audit)
**Risk:** Low
**Description:** In `src/app/pipeline/page.tsx`, the `topStats` array (Channels "42,214", Videos "2,178,548", Brands "38,987", API Cost "$600") and all stage stats throughout are hardcoded. The TopBrandsTable correctly fetches from `/api/sponsors` — good. But the rest is static. Either create an API route `/api/pipeline` that returns current stats, or document these as point-in-time snapshots with a "Last updated" date. The Sponsor Detection stage note "Waiting for fine-tuned model" is outdated.
**Files:** `src/app/pipeline/page.tsx`, optionally new `src/app/api/pipeline/route.ts`
**Success looks like:** Pipeline stats update dynamically or clearly show last-updated date. Outdated notes removed.
**Status:** Pending

---

### [TASK-007] Projects page — Update stale project statuses and data
**Added by:** Code Factory (from audit)
**Risk:** Low
**Description:** In `src/app/projects/page.tsx`, the entire `projects` array is hardcoded with stale data: (1) "Sponsor Detection v5 Retrain" shows "Blocked" with OOM error — v5 has progressed. (2) "Inbound Email Engine" blocked status may be stale. (3) Agentio stats are weeks old. (4) Channel Qualification shows "Paused" — verify. Create a `public/data/projects.json` that can be updated by a cron job, and import from that instead of inline constants.
**Files:** `src/app/projects/page.tsx`, optionally new `public/data/projects.json`
**Success looks like:** Project statuses reflect current reality. No stale blockers or outdated numbers.
**Status:** Pending

---

### [TASK-008] Infrastructure page — Replace all fabricated host/process data
**Added by:** Code Factory (from audit)
**Risk:** Medium
**Description:** In `src/app/infrastructure/page.tsx`, the entire `hosts` array is fabricated: CPU percentages, RAM usage, disk usage, Ollama models, PIDs, process names are all fiction. This is actively misleading. Create an API route `/api/infrastructure` or use a collector pattern. At minimum, remove fake data and show "Live data coming soon" rather than fabricated PIDs and percentages. The mission_control_collector.py already runs — check if it exposes infrastructure data that can be consumed here.
**Files:** `src/app/infrastructure/page.tsx`, new `src/app/api/infrastructure/route.ts`
**Success looks like:** Infrastructure page shows real data or clearly indicates unavailable. No fabricated PIDs.
**Status:** Pending

---

### [TASK-009] Calendar page — Wire to real cron schedule data
**Added by:** Code Factory (from audit)
**Risk:** Low
**Description:** In `src/app/calendar/page.tsx`, the `cronJobs` array is a manually-maintained list of ~70 entries duplicating (poorly) the data in `real-cron-data.ts`. Import from `realCronJobs` instead and parse the `schedule` field to determine time slots. Duration values are all guesses — remove or compute from real data.
**Files:** `src/app/calendar/page.tsx`
**Success looks like:** Calendar derives data from `realCronJobs`. No duplicate data maintenance.
**Status:** Pending

---

### [TASK-010] Crons page — Add live data refresh
**Added by:** Code Factory (from audit)
**Risk:** Low
**Description:** The Crons page imports from `real-cron-data.ts` (759 lines, best data in the app) but it's a static file — `lastRun` fields ("59 mins ago") become stale immediately. Create an API route `/api/crons` that reads live cron status from OpenClaw, and have the page fetch with a 60s polling interval. Keep `real-cron-data.ts` as fallback.
**Files:** `src/app/crons/page.tsx`, new `src/app/api/crons/route.ts`
**Success looks like:** Cron statuses update in real-time. "Last run" times are accurate.
**Status:** Pending

---

### [TASK-011] Verify blacklisted domains page data connection
**Added by:** Code Factory (from audit)
**Risk:** Low
**Description:** The blacklisted domains page correctly fetches from `CA_DATA_URL`. Verify this works in production Vercel deployment — check env var is set and endpoint is accessible. This is the best-wired page; use as pattern for others.
**Files:** `src/app/blacklisted-domains/page.tsx`
**Success looks like:** Page loads real data in production. Pattern documented for other pages.
**Status:** Pending

---
