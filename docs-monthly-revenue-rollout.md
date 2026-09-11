# Monthly creator revenue rollout

The private all-time endpoint optionally includes `snapshot.monthly`. Each row
contains a calendar month and per-source USD amounts. `undatedSources.msn`
contains the manual MSN lifetime balance: it is not assigned to invented months.
Monthly source sums plus undated balances must reconcile individually to the
lifetime snapshot before ingestion publishes the snapshot. A mismatch records a degraded attempt. Monday uses only the
included rows from the same audited capture, including signed refunds.

Deploy the Convex changes before installing the updated collector. Deploy the
CA HQ chart in either order; older snapshots show monthly history as unavailable.
Then update the existing collector checkout through its normal release process
and run the combined collector under its existing lock. Keep its current schedule,
service identity, private configuration and secrets. Do not run a second scheduler.

Run `collect_all_revenue.py --dry-run` with the existing runtime environment first.
Verify monthly rows reconcile per source and the current month is partial through
the snapshot date. Compare source totals with the prior run, investigating any
unexpected historical movement. Run the combined collector normally and confirm
`/revenue/all-time` has `healthy: true` and `snapshot.monthly`, then check the chart
and filters in Apple's authenticated CA HQ dashboard. The next daily run must also
include monthly data; reverting to an older collector removes it from new snapshots.

Platform reports now use explicit calendar-month windows (three concurrent
requests per platform). Close is still one paginated lifetime read with `date_won`
included. Historical corrections are picked up every day. Monthly and lifetime
values are generated from the same successful capture; failed sources are never
filled using prior figures. No secrets, public routes, or access rules change.
