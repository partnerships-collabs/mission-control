# Monthly request recovery

AdsByMoney full-month reports can return HTTP 504 even without concurrent
requests. An isolated repeat subsequently succeeded. Date subdivision is NOT
enabled: a full-month versus disjoint-halves probe failed exact cents parity.
Original full-month reports and existing rounding remain authoritative.

The unified collector now requests AdsByMoney months sequentially. Successful
months are saved immediately in the private per-run checkpoint, together with
Close inputs, Monday reconciliation inputs and other platform months. Recovery
passes revisit failed months only (two additional passes, existing bounded
three-attempt request retries, provider Retry-After, 20-minute capture budget).
Authentication and validation failures are permanent. Logs contain only source,
date bounds, attempt, duration and status, never request bodies or credentials.

Checkpoints use the existing 0700 directory, 0600 files, checksum, atomic writes,
size limit and 45-minute expiry. A partial capture also expires at its original
20-minute work deadline; restarting cannot extend the work budget. Run identity,
cutoff, origin and original constituent timestamps survive process interruption.
The source timestamp is the earliest saved monthly input, not the resume time.
Terminal captures transfer to the existing immutable upload checkpoint; a failed
terminal run is not republished under the same identity.

Protected health distinguishes connector failure, validation rejection and upload
failure. Intentionally omitted evidence after a connector failure is not called
a Monday mismatch. A complete capture still requires valid matching evidence.
The public number and dataset header contract are unchanged. CA HQ's existing
generic failed-collection and source-delay UI accepts the additive issue codes.

Release through the registered Apple owner route, deploy the exact Convex SHA,
and pin the idle Mini to it. Leave the noon Central job and disabled Studio
scheduler unchanged. Before real-time activation require a fresh complete baseline,
independent shadow parity and the existing live activation/replay gates. A daily
connector failure after activation must not prevent Close from refreshing against
the previous verified affiliate baseline with its original timestamps/warnings.
