# Apple's all-time creator revenue

The existing Mac Mini noon Central LaunchDaemon runs `scripts/collect_all_revenue.py`,
which shares one Monday reconciliation between the YTD and lifetime collectors. Both use the existing process lock,
dedicated Google reader, 1Password identities and three-attempt retry policy.
No new launchd schedule is required. The all-time collector writes only
`revenue_all_time_runs`; it cannot replace the Smiirl snapshot.

## Definition and coverage

Sum gross USD brand partnership contracts won in Close plus Impact Total_Cost,
RedVentures commission, AdsByMoney earnings and manually recorded MSN revenue.
The Close contracts are counted once at their full one-time value. These are the
same five source definitions used by Smiirl, extended to the lifetime period.
This is gross creator deal volume, not agency commission. The supplemental Monday
source counts received payments; see [MONDAY.md](MONDAY.md) for reconciliation,
estimates and the private review list.

Close is queried without a lower date bound. The affiliate APIs are queried
from January 1, 2020, before the company's first 2021 Close wins. The September
2026 read-only audit returned no pre-account revenue in those early periods.
Impact uses calendar years (at most 366 daily records per request), RedVentures
uses consecutive inclusive windows of at most 31 days, and AdsByMoney uses
calendar months. All history is fetched daily, including past years, so later
corrections flow through. Requests that fail or truncate block publication.

## MSN history input

The existing Counter spreadsheet is `11m_IbqoiIcWhxLTjNONbrqCe-2NMA8FMxFuOd3LwnoU`.
The live YTD number remains `Sheet1!B9`. The lifetime reader additionally reads
`Sheet1!A11:B40`. History may be recorded as a verified cumulative balance labeled
`Through YYYY`, followed by one year/amount pair for each subsequent completed
year. Alternatively, record all completed years individually from 2020 onward.
Overlapping cumulative and annual entries are rejected.

Apple confirmed lifetime MSN revenue of **$330,767.36** on September 9, 2026.
The same-day Counter YTD input was **$119,914.00**, so `Sheet1!A11:B11` records
`Through 2025` and **$210,853.36**. This fixed balance plus the changing B9 input
reproduces the confirmed total and includes subsequent YTD increases. Do not make
the balance a formula subtracting the live B9 input; that would freeze lifetime
revenue. The cell note records the source and calculation.

For annual entry mode, the shape is:

| Column A | Column B |
| --- | --- |
| 2020 | Verified full-year USD amount, including explicit zero when confirmed |
| 2021 | Verified full-year USD amount |
| ... | ... |
| 2025 | Verified full-year USD amount |

There is no header in row 11. Blanks are missing data, not zero revenue. An
unverified or missing year after the cumulative cutoff (or since 2020 without
a cumulative balance) blocks a new complete total. The collector adds the
history to B9 exactly once. At each year rollover, add the finished
year's final MSN amount and update B9 for the new year, as required for Smiirl.
The dedicated identity remains read-only; this collector never edits the sheet.

## Consumer and failure behavior

`GET /revenue/all-time` requires the existing activity secret and returns only
the most recent verified snapshot for the active source set, its freshness and latest attempt
issues. A failed run preserves the previous complete total. Until the first
complete run, `snapshot` is null. No partial sum is labeled as lifetime revenue.

CA HQ reads the route on the server with `MISSION_CONTROL_ACTIVITY_SECRET`,
scoped to the existing 1Password `mission_control_activity` authority. Only
Apple's dashboard and authenticated API expose the report. The open panel polls
once per minute and on tab visibility, showing the last verification time and a
delayed/unavailable status when appropriate. Responses are not cached.

## Release verification

1. Run `npm test`, TypeScript, both app builds and the collector `--dry-run`.
2. Ship the Convex schema/functions through the existing reviewed production
   workflow; verify both new routes reject unsigned requests.
3. Configure the CA HQ server credential from 1Password with a read-before-write
   drift check. Never print or put it in browser code.
4. Ship CA HQ through its existing main-branch deployment.
5. Pin the Mini runtime to the reviewed Mission Control commit and run the
   existing wrapper. Verify a complete all-time snapshot, unchanged Smiirl
   semantics, Apple access and denial for other users.
6. Check the next scheduled noon execution and the timestamp displayed in HQ.

Verify all source histories, Monday reconciliation and the deployed daily runtime before claiming completion.
