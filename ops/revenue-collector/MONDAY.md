# Supplemental affiliate revenue

> The unified collector changes MSN from covered-by-Counter to included Monday
> payments in its own `msn` category. See [UNIFIED.md](UNIFIED.md). Other coverage
> rules below remain unchanged; the legacy collector retains its old behavior.

The existing noon Central service runs `scripts/collect_all_revenue.py`. It reads
CA Affiliates board `4984917746` once, reconciles it against the full won Close
opportunity list and Impact's annual Performance by Brand reports (2020 onward),
uploads a private immutable audit, then supplies that same audit to YTD and
lifetime collectors. The five existing source definitions remain authoritative.

## Counting policy approved by Apple, September 9, 2026

- Count Paid In Full by Payment Date, using Gross Amount in USD.
- When gross is blank, estimate CA Net / 0.20, otherwise Creator Payout / 0.80.
  Recorded gross takes precedence, including explicit zero. Round each row to
  cents. Conflicting split values remain review items.
- Apple confirmed the board's current history (July 2023 onward) is the complete
  historical source for these additional payments. Do not invent a pre-board baseline.
- Exclude Impact-tagged rows with matching historical revenue programs; MSN /
  Microsoft Start, AdsByMoney / Money.com, and RV / Bankrate / LinkOffers aliases
  retain their existing source. Never add a difference between the board's paid
  total and an API's earned total: these have different timing and adjustments.
- A Direct row matching an Impact program is held for review. A matching nonzero
  Close brand/creator contract also holds the row, unless its notes explicitly
  reference that Close opportunity, in which case it is already counted.
  Zero-dollar affiliate opportunities do not consume revenue.
- Program/creator aliases are explicit and reviewable. New programs are held
  until classified. Matching brand names alone do not establish duplicates.
- An invoice may contain many valid rows. Item ID identifies a row; identical
  name/invoice/receipt/period/amount lines are held rather than arbitrarily merged.
- Signed corrections are included. Estimated rows and unresolved exclusions are
  separately visible in Apple's CA HQ audit. Review exclusions do not prevent
  publishing the other reconciled rows. Connector/incomplete-fetch failures do.

## Persistence and access

1Password key `monday` supplies the API token through the approved loader; no new
runtime secret mirror is needed. Monday is read-only. Previously observed item
IDs persist in the service's private state directory as `monday-item-ids.json`.
Archived rows are re-read by ID. Missing, deleted or moved history causes a failed
attempt rather than silently dropping previously counted revenue.

Audit uploads use 100-row chunks and a finalization mutation that independently
validates every included amount/date, unique item IDs and both cent-based totals.
Snapshots reference the immutable audit ID. Unfinished audits cannot publish.
An optional `monday_affiliates` field permits reading old five-source snapshots;
after a period first publishes six sources it rejects subsequent five-source
attempts. Failed updates preserve the previous verified snapshot.

All `/revenue/monday/*` endpoints require the activity secret. The open Smiirl
endpoint stays exactly `{ "number": integer }` and reports YTD. CA HQ's audit proxy
and display are restricted to Apple. Detailed rows are never exposed publicly.

## Verification and release

Run `npm test`, `npx tsc --noEmit --incremental false`, `npm run build` and the
coordinator's `--dry-run` on the existing Mini revenue environment. Dry runs do not
upload audits or change the archive-ID state. Test incomplete uploads, source
failures, retries, signed corrections, estimate rounding, year rollover, invoice
splits, aliases and five-source regression rejection. Compare both payloads to the
same Monday audit; no review/covered row may contribute.

Deploy additive Convex changes via the protected GitHub production workflow;
ship the compatible CA HQ display; pin the Mini service checkout to the reviewed
Mission Control commit. Keep the current LaunchDaemon schedule unchanged. Verify
the resulting JSON, six-source protected responses, private paginated audit and
existing service's next scheduled run. No direct Vercel production CLI deployment.

Business-specific program classifications and creator aliases live in the private
service state directory's `monday-policy.json`, not this public repository. Its
`programs` array contains normalized supplemental program names; `creatorAliases`
normalizes creator naming differences. The audited rule version includes a digest
of this policy. A missing or invalid policy fails closed. New programs remain in
review until their coverage is checked and the private policy is updated.

For a reviewed invoice exception, the optional private `overrides` map is keyed
by item ID. Each entry requires a fingerprint from `item_fingerprint`, a
disposition (`included`, `covered`, or `review`) and nonempty evidence references.
Covered entries also specify the existing source. An edit to the reviewed
financial inputs invalidates the exception and holds the row for review again;
an exception cannot make unpaid or future payments count.

Before first activation, seed `monday-item-ids.json` with the IDs from the approved
initial board capture, preserving any existing IDs. This catches rows archived
between the initial audit and release. Keep both state files private (0600).
