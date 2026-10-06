# Protected genuine-event replay

The existing authenticated `POST /revenue/realtime/configure` also accepts
`{"operation":"replay_event","eventId":"ev_..."}` for release verification.
No new route, credential, or scheduled job is added.

It requires an idle, error-free shadow/live queue. It fetches the original event
from Close using the existing server credential, verifies its organization,
ID/type/action/revision, and signs the unchanged event with the existing Convex
webhook key. The destination is the deployment's system `CONVEX_SITE_URL`, never
caller input. Redirects are rejected. Invalid signatures must return401; the
signed event and its identical duplicate traverse the real webhook HTTP route.
The response contains only IDs, timing, and acceptance/deduplication flags.
Already-accepted events are reported honestly, not counted as a new refresh.

No signing keys, revenue records, request bodies, or raw upstream errors are
returned or logged. Ordinary revenue operation never invokes this diagnostic.
The caller must separately verify queue completion, shared publication and
elapsed time. Authentication and accounting rules are unchanged.
