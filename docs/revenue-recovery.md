# Revenue recovery: diagnostic release

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
