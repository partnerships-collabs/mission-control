# Automatic Close updates

This supersedes the all-or-nothing freshness policy in UNIFIED.md after real-time
activation. There are no AI calls, Codex automations, or extra Mac timers in this
data path. The existing Mini noon Central collector remains unchanged in schedule.

## Publication contract

The existing signed Close webhook validates the exact configured organization
and subscription. It stores event ID + revision transactionally before acknowledging
delivery. Events only request a full current won-opportunity capture; webhook
amounts never increment revenue. The durable scheduler debounces for ten seconds.
A two-minute lease allows one capture at a time; newer requests cause a follow-up
pass. Failures back off 1/5/15 minutes, respecting Retry-After up to an hour. A
one-minute recovery cron repairs abandoned jobs and requests a midnight Central
calendar recalculation. Idle minutes do not call Close.

Daily collection uploads sealed, bounded private evidence chunks: Monday inputs,
Impact overlap references, private accounting decisions/aliases and Close facts.
Python's calculation must exactly match the shared TypeScript calculation before
the baseline can be accepted. Every real-time run recomputes Monday exclusions
against the latest complete Close capture. Existing manual exceptions whose related
Close evidence changes block publication pending review; they cannot silently
bypass overlap checks. Captured Close facts, Monday audit, period totals and the
single publication pointer commit atomically.

A daily run in live mode stages its affiliate baseline instead of publishing its
older Close capture. A fresh worker merges it with current Close. Baseline/version
checks reject a worker that started against superseded inputs. Failed daily runs
leave the prior affiliate baseline available, with original fetched timestamps.
No affiliate API history is requested by real-time workers. Health distinguishes
latest Close refresh, last complete daily reconciliation, failures and queue state.
Both Smiirl and CA HQ always read the same publication. Public JSON is unchanged.

## Safe release sequence

1. Run npm test, typecheck/build, and the real loopback Convex staging test. The
   staging tool is pinned to localhost:3281/3282 and uses no production write API.
   Do not commit `.convex/`, `.env.local`, captured financial inputs or credentials.
2. Ship the compatible CA HQ display via Apple's registered owner path. Deploy
   Convex using the existing protected `Deploy Convex production` workflow at the
   exact reviewed source SHA. Keep real-time configuration off. Verify SHAs.
3. Configure expected organization/subscription with mode off using the protected
   POST `/revenue/realtime/configure`. Pin the Mini to the reviewed code, leaving
   the existing noon schedule and disabled Studio scheduler untouched. Run the
   existing collector wrapper to upload a complete verified baseline/evidence.
4. Set mode shadow. Verify protected GET `/revenue/realtime/status`, compare the
   shadow run against an independent current Close capture and the baseline's
   Monday/YTD/lifetime/monthly calculation. The displayed publication must not
   change from the shadow run. A shadow must match the current baseline/config,
   be verified and less than fifteen minutes old before live activation.
5. Broaden only the existing Close subscription to opportunity created/updated/
   deleted and relevant lead name/merge changes. Queue during initialization.
   Set mode live: a new catch-up capture, not the old shadow, is published.
6. Verify a genuine/replayed real notification, signature/identity validation,
   matching dataset IDs, exact Smiirl rounding and actual signed-in HQ display.
   Check the physical counter's free Reactivity setting separately.
7. Observe the next noon run: verified baseline queued, then a fresh Close merge,
   with no older capture replacing the newer published Close facts.

Configuration/status require the existing activity secret. Never put it in a
URL, console output, chat, committed file or command argument. Use the existing
direct 1Password loader on the Mini. Existing subscription signing credentials
remain unchanged. Do not register a duplicate subscription.

Rollback sets mode off. It cancels pending publication, invalidates the lease,
and retains the shared dataset plus compatible daily collector. Do not restart
an independent legacy writer or the disabled Studio scheduler.

The separate monthly MSN Slack reminder is to be removed entirely, with no
replacement. This repository does not itself delete that Slack reminder.
