# Unified creator revenue — September 18, 2026

Apple approved one data source for Smiirl YTD and CA HQ lifetime/monthly reporting,
with **MSN read from payments on CA Affiliates**, not the Counter sheet or MSN login.
This supersedes the independent publication and manual-MSN sections of ALL_TIME.md.

## Source and accounting contract

- One noon America/Chicago job, existing service identity, lock, retries and alerts.
- Close won USD one-time contracts: one complete capture supplies daily cents,
  lifetime/YTD/monthly/30-day values, and Monday overlap evidence.
- Impact, RedVentures and AdsByMoney: same historical reporting definitions and
  2020 onward windows, captured once per platform/period for both displays.
- Monday: one complete board capture including previously observed archived IDs,
  with existing Close/Impact duplicate coverage, estimates and private overrides.
- MSN/Microsoft Start, including deficit/excess adjustments: Paid In Full gross
  USD by **payment date**, in a separate `msn` reporting category. It is not added
  again to `monday_affiliates`. That category contains other supplemental payments.
  Ambiguous MSN payment rows block publication. Unpaid/future payments do not count.
- No Counter sheet balance or Microsoft login is used by the unified job. Existing
  credentials/files are left untouched; removing them is not part of deployment.

Read-only preflight of the September 18 legacy audit reconciled the recorded MSN
payments to the old sheet within sub-dollar rounding differences. Detailed amounts
remain private. These are payment-basis totals, not accrued earnings in Partner
Hub. Never freeze reconciliation amounts in the collector.

## Capture, validation and publication

`collect_all_revenue.py` sends daily Close cents, complete contiguous platform
month cents, six source-health records, and the ID of a finalized immutable Monday
audit to the protected `/revenue/unified/collection-run` endpoint. Convex derives
monthly, YTD, lifetime and existing pace metrics. Input source totals are checked
against those derived amounts; no supplied grand total is accepted.

`revenue_unified_runs` is immutable. A single `revenue_publication` record points
at the published run and the most recent attempted run. One Convex transaction
records the run and moves the pointer only when every required input validates.
Identical retries are idempotent; conflicting run IDs and out-of-order publications
are rejected. Failed attempts keep both readers on the same last-good dataset and
mark both unhealthy. Malformed/unauthenticated submissions cannot mutate anything.

Both existing GET routes and protected health read this pointer. Smiirl's body
remains exactly `{"number": integer}`; `X-Revenue-Dataset` exposes only its opaque
run ID. CA HQ receives the same dataset ID, YTD cross-check, monthly history and
shared health. All responses remain uncached. The old ingestion routes reject
writes after the first unified publication; pre-cutover rows are retained intact.

## Ordered rollout

Pre-release evidence: local unit/storage tests and builds passed; the initial
isolated Mini dry run completed all sources without any private-review exclusions.
Repeated historical preflight requests later encountered provider 403/429 errors
and were correctly rejected. No production candidate has been published by these
checks. A fresh complete server-side shadow run remains a mandatory release gate.
The historical RedVentures capture now reuses one in-memory token for all months
instead of requesting one per month; this is tested without persisting the token.

1. Run `npm test`, TypeScript and builds in both clean maintenance worktrees.
   Test actual registered mutations against disposable local stores first.
2. Run the new collector's `--dry-run` from an isolated Mini directory with its
   existing approved secret loader. It does not post or update archive state.
3. Ship the backward-compatible CA HQ parser/UI through the reviewed production
   publishing path. Do this before activating the new combined Monday audit.
4. Deploy additive Convex code through the protected GitHub production workflow.
   Before first publication legacy reads and writes continue unchanged.
5. Run `--shadow` on the Mini. The server validates and records a candidate without
   moving the shared pointer. Compare sources and both period totals against the
   old endpoints; explain every difference before activation.
6. Pin the Mini service checkout to the reviewed commit, preserve the LaunchDaemon
   schedule, and invoke its existing wrapper for the first atomic publication.
   Update the unloaded Studio standby to the same reviewed version; never load
   both schedulers. Run `check-revenue-health.sh` to prove source freshness, shared
   IDs/health, Smiirl rounding, and monthly YTD reconciliation.
7. Verify the authenticated Apple dashboard and denial for other accounts, then
   verify the next scheduled noon run. Do not claim these steps from unit tests.

Before first publication, rollback simply keeps the existing runtime active. After
activation, never restart a legacy writer (it is intentionally rejected). Preserve
the shared last-good dataset while shipping a reviewed forward fix. Any deliberate
rollback of the publication pointer requires a separately reviewed mutation and
must move both consumers together, never edit historical records in place.

The existing monthly MSN sheet reminder has not been changed by this code release.
Any replacement reminder should concern logging payments on Monday, not maintaining
a second revenue total.
