# Revenue collector

`revenue_collector.py` is the tracked canonical source for the daily revenue
collector. It is staged here so its request contract can ship with the matching
Convex schema and route. The currently installed launchd job does not use this
file yet.

Each run reports five source-health records plus collector timestamps and a run
ID. Convex is the only component that calculates or publishes totals. If any
source fails, the attempt is recorded as degraded and the last verified Smiirl
snapshot remains unchanged.

## MSN credential contract

The collector accepts exactly one explicit credential input:

- `MSN_GOOGLE_SERVICE_ACCOUNT_B64`: base64-encoded JSON injected in memory, or
- `MSN_GOOGLE_SERVICE_ACCOUNT_FILE`: absolute path to the dedicated credential.

There is no default credential and no local revenue fallback. The identity must
be dedicated to this collector, have access to the Counter spreadsheet, and is
used with the `spreadsheets.readonly` OAuth scope. The only requested range is
`Sheet1!B9`.

## Verification

Run the secret-free regression suite with:

```bash
npm run test:collector
```

The production switch should happen only after the matching Convex deployment,
dedicated Google identity provisioning, a successful dry run, and a manual
end-to-end run that reports `published: true`.
