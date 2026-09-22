# Revenue recovery: confirmed timeout repair

## Confirmed production root cause (September 22)

Diagnostic release `1f25516e250984722ed6df84479f734fb7336753`, request
`5779390249`, Convex run `35748799336`, deployed successfully. Controlled run
`5d97b451-ea63-4a79-8261-8bcabc194d1e` fetched every source successfully but
publication returned `503 execution_limit` with `retryable:false`. The previous
handler converted this same class of runtime failure to opaque HTTP 400.

The override guard repeatedly normalized and canonicalized Close facts per
Monday exception. It now prepares each fact once and reuses identical checks,
without changing matching or canonical comparison rules. Same private fixture:
503 ms before, 14 ms after on this host. The operation-count regression fails
before (1,500,000 lead reads) and passes after (9,000). Actual Convex full-size
sequential ingestion and rejection checks pass after the change.

## Recovery additions

- Capture-start status is durable and independent of publication; errors remain
  visible after a newer Close publication. Manual runs do not satisfy noon gates.
- Request-level bounded backoff respects Retry-After; permanent failures stop.
- Completed payload/audit checkpoints are private mode 0600, digest-checked and
  credential-free. Resuming reuses IDs/timestamps and idempotent chunks. Captures
  older than 45 minutes are replaced by fresh collection, never relabeled.
- The existing wrapper does one capture, with request-level retries rather than
  repeating all histories. It preserves the lock, noon schedule and existing
  failure-alert destination. Direct calls are manual; launchd's noon calls are
  marked scheduled. Do not manually kickstart launchd for verification.

Production recovery and Close activation are still gated on exact deployment,
Mini installation, a healthy complete collection, authorized credential repair,
shadow parity, and the first actual post-activation noon collection.

## Diagnostic release history

Real-time publication remains **off**. This additive release does not change
accounting, credentials, subscriptions, collection schedules or the public JSON.

An authenticated unified upload now records an independent receipt before the
publication mutation. Rejections retain a controlled error code, never the raw
exception (which can contain private documents). Protected health/all-time reads
include `collection`; rejected uploads make health unhealthy immediately while
the last verified publication remains unchanged. Abandoned uploads are marked
incomplete after ten minutes. Shadow uploads cannot change daily health, and a
conflicting replay cannot downgrade an already committed verified run.

## Verification (2026-09-22)

- Unit/collector suite, TypeScript and production build passed.
- Disposable loopback Convex tested two consecutive full-size daily publications
  (3,080 Monday rows, 1,426 Close facts), identical retries, unauthenticated
  rejection, schema rejection, durable failed health, and unchanged public
  dataset/number after failure.
- Private captures and local admin configuration are not repository artifacts.
- No claim is made yet about the production HTTP 400 root cause. The prior
  handler concealed the exception; production diagnostics must establish it.

## Next gate

Publish/deploy using the Apple owner route. Verify exact production SHA and
off mode, then perform one controlled collection attempt and inspect its safe
error code/receipt. Fix the confirmed cause with a failing regression before
making performance or accounting changes. Keep this request/run journal if a
release is pending; do not dispatch a duplicate deployment.

Still required: repair the Convex Close credential through authorized access;
request-level retries/private resumable collection; scheduled-vs-manual run
tracking and HQ display; production parity/shadow/live verification; first actual
post-activation noon reconciliation. Slack/MSN reminders and Smiirl settings are
user-completed and excluded. Never restart the Studio collector.
