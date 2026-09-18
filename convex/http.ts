import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import {
  hasValidActivityToken,
  verifyCloseWebhookSignature,
} from "./httpSecurity";

const http = httpRouter();

// ── Auth helper ───────────────────────────────────────────────────────────────

function checkActivityToken(req: Request): boolean {
  return hasValidActivityToken(req, process.env.ACTIVITY_LOG_SECRET);
}

function unauthorizedResponse(): Response {
  return new Response(JSON.stringify({ error: "Unauthorized" }), {
    status: 401,
    headers: { "Content-Type": "application/json" },
  });
}

// ── Health ────────────────────────────────────────────────────────────────────

http.route({path:'/revenue/unified/collection-run',method:'POST',handler:httpAction(async(ctx,req)=>{
  if (!checkActivityToken(req)) return unauthorizedResponse();
  try {
    const result=await ctx.runMutation(internal.revenue.recordUnifiedRunInternal,await req.json());
    return new Response(JSON.stringify(result),{headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
  } catch {
    return new Response(JSON.stringify({error:'Unified revenue attempt rejected'}),{status:400,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
  }
})});

for (const path of ['/revenue/monday/chunk', '/revenue/monday/complete']) {
  http.route({path, method:'POST', handler:httpAction(async (ctx, req) => {
    if (!checkActivityToken(req)) return unauthorizedResponse();
    try {
      const body = await req.json();
      const result = path.endsWith('/chunk')
        ? await ctx.runMutation(internal.mondayRevenue.recordChunkInternal, body)
        : await ctx.runMutation(internal.mondayRevenue.completeAuditInternal, body);
      return new Response(JSON.stringify(result), {headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
    } catch { return new Response(JSON.stringify({error:'Monday reconciliation rejected'}), {status:400}); }
  })});
}
http.route({path:'/revenue/monday/audit', method:'GET', handler:httpAction(async (ctx, req) => {
  if (!checkActivityToken(req)) return unauthorizedResponse();
  try {
    const params = new URL(req.url).searchParams;
    const result = await ctx.runQuery(internal.mondayRevenue.auditInternal, {auditId:params.get('auditId') ?? '',
      page:Number(params.get('page') ?? '0'), ...(params.get('disposition') ? {disposition:params.get('disposition')!} : {})});
    return new Response(JSON.stringify(result), {status:result ? 200 : 404, headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
  } catch { return new Response(JSON.stringify({error:'Monday reconciliation unavailable'}), {status:400}); }
})});

http.route({
  path: "/health",
  method: "GET",
  handler: httpAction(async () => {
    return new Response(JSON.stringify({ ok: true, ts: Date.now() }), {
      headers: { "Content-Type": "application/json" },
    });
  }),
});

// ── Activity log ──────────────────────────────────────────────────────────────

http.route({
  path: "/activity/log",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    console.log("[activity/log] received");
    try {
      const body = await req.json();
      console.log("[activity/log] agent:", body.agent, "type:", body.type);
      await ctx.runMutation(internal.activity.logActivityEventInternal, body);
      return new Response("ok", { status: 200 });
    } catch (e) {
      console.error("[activity/log] error:", e instanceof Error ? e.message : String(e));
      return new Response("error", { status: 500 });
    }
  }),
});

// ── Batch update ──────────────────────────────────────────────────────────────

http.route({
  path: "/batch",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    console.log("[batch] received");
    try {
      const body = await req.json();
      await ctx.runMutation(internal.collectors.batchUpdateInternal, body);
      return new Response("ok", { status: 200 });
    } catch (e) {
      console.error("[batch] error:", e instanceof Error ? e.message : String(e));
      return new Response("error", { status: 500 });
    }
  }),
});

// ── Token usage ───────────────────────────────────────────────────────────────

http.route({
  path: "/token/update",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    console.log("[token/update] received");
    try {
      const body = await req.json();
      await ctx.runMutation(internal.collectors.updateTokenCapacityInternal, body);
      return new Response("ok", { status: 200 });
    } catch (e) {
      console.error("[token/update] error:", e instanceof Error ? e.message : String(e));
      return new Response("error", { status: 500 });
    }
  }),
});

// ── Sponsor pipeline ──────────────────────────────────────────────────────────

http.route({
  path: "/sponsor-pipeline",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    console.log("[sponsor-pipeline] received");
    try {
      const body = await req.json();
      console.log("[sponsor-pipeline] fields:", Object.keys(body).join(", "));
      await ctx.runMutation(internal.collectors.upsertSponsorPipelineInternal, body);
      return new Response("ok", { status: 200 });
    } catch (e) {
      console.error("[sponsor-pipeline] error:", e instanceof Error ? e.message : String(e));
      return new Response(JSON.stringify({ error: String(e) }), { status: 500 });
    }
  }),
});

// ── Projects ──────────────────────────────────────────────────────────────────

http.route({
  path: "/projects/upsert",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    console.log("[projects/upsert] received");
    try {
      const body = await req.json();
      await ctx.runMutation(internal.projects.upsertProjectInternal, body);
      return new Response("ok", { status: 200 });
    } catch (e) {
      console.error("[projects/upsert] error:", e instanceof Error ? e.message : String(e));
      return new Response("error", { status: 500 });
    }
  }),
});

// ── Needs Apple ───────────────────────────────────────────────────────────────

http.route({
  path: "/needs-apple/add",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    console.log("[needs-apple/add] received");
    try {
      const body = await req.json();
      await ctx.runMutation(internal.needsApple.addItemInternal, body);
      return new Response("ok", { status: 200 });
    } catch (e) {
      console.error("[needs-apple/add] error:", e instanceof Error ? e.message : String(e));
      return new Response("error", { status: 500 });
    }
  }),
});

http.route({
  path: "/needs-apple/list",
  method: "GET",
  handler: httpAction(async (ctx) => {
    try {
      const items = await ctx.runQuery(internal.needsApple.listUnresolvedInternal, {});
      return new Response(JSON.stringify(items), {
        headers: { "Content-Type": "application/json" },
      });
    } catch (e) {
      console.error("[needs-apple/list] error:", e instanceof Error ? e.message : String(e));
      return new Response("error", { status: 500 });
    }
  }),
});

http.route({
  path: "/needs-apple/resolve",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    console.log("[needs-apple/resolve] received");
    try {
      const body = await req.json();
      await ctx.runMutation(internal.needsApple.resolveItemInternal, body);
      return new Response("ok", { status: 200 });
    } catch (e) {
      console.error("[needs-apple/resolve] error:", e instanceof Error ? e.message : String(e));
      return new Response("error", { status: 500 });
    }
  }),
});

// ── Revenue ───────────────────────────────────────────────────────────────────

http.route({
  path: '/revenue/all-time', method: 'GET',
  handler: httpAction(async (ctx, req) => {
    if (!checkActivityToken(req)) return unauthorizedResponse();
    const report = await ctx.runQuery(internal.revenue.allTimeRevenueInternal, {});
    return new Response(JSON.stringify(report), { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
  }),
});

http.route({
  path: '/revenue/all-time/collection-run', method: 'POST',
  handler: httpAction(async (ctx, req) => {
    if (!checkActivityToken(req)) return unauthorizedResponse();
    try {
      const result = await ctx.runMutation(internal.revenue.recordAllTimeRunInternal, await req.json());
      return new Response(JSON.stringify(result), { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
    } catch {
      return new Response(JSON.stringify({ error: 'All-time revenue attempt rejected' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }
  }),
});

http.route({
  path: "/revenue/snapshot",
  method: "GET",
  handler: httpAction(async (ctx, req) => {
    console.log("[revenue/snapshot GET] received");
    if (!checkActivityToken(req)) return unauthorizedResponse();
    try {
      const snapshot = await ctx.runQuery(internal.revenue.latestSnapshotInternal, {});
      return new Response(JSON.stringify(snapshot ?? null), {
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-store, max-age=0",
        },
      });
    } catch (e) {
      console.error("[revenue/snapshot GET] error:", e instanceof Error ? e.message : String(e));
      return new Response("error", { status: 500 });
    }
  }),
});

http.route({
  path: "/revenue/snapshot",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    console.log("[revenue/snapshot POST legacy] received");
    if (!checkActivityToken(req)) return unauthorizedResponse();
    try {
      const body = await req.json();
      await ctx.runMutation(internal.revenue.upsertLegacySnapshotInternal, body);
      return new Response("ok", {
        status: 200,
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Cache-Control": "no-store, max-age=0",
        },
      });
    } catch {
      console.error("[revenue/snapshot POST legacy] rejected");
      return new Response(JSON.stringify({ ok: false, error: "Legacy revenue ingestion unavailable" }), {
        status: 409,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-store, max-age=0",
        },
      });
    }
  }),
});

http.route({
  path: "/revenue/collection-run",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    console.log("[revenue/collection-run POST] received");
    if (!checkActivityToken(req)) return unauthorizedResponse();
    try {
      const body = await req.json();
      const result = await ctx.runMutation(
        internal.revenue.recordCollectionRunInternal,
        body,
      );
      return new Response(JSON.stringify({ ok: true, ...result }), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-store, max-age=0",
        },
      });
    } catch {
      console.error("[revenue/collection-run POST] rejected");
      return new Response(JSON.stringify({ ok: false, error: "Revenue attempt rejected" }), {
        status: 400,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-store, max-age=0",
        },
      });
    }
  }),
});

http.route({
  path: "/revenue/health",
  method: "GET",
  handler: httpAction(async (ctx, req) => {
    console.log("[revenue/health] received");
    if (!checkActivityToken(req)) return unauthorizedResponse();
    try {
      const health = await ctx.runQuery(internal.revenue.revenueHealthInternal, {});
      return new Response(JSON.stringify(health), {
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-store, max-age=0",
        },
      });
    } catch (e) {
      console.error("[revenue/health] error:", e instanceof Error ? e.message : String(e));
      return new Response(JSON.stringify({ error: "Revenue health unavailable" }), {
        status: 503,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-store, max-age=0",
        },
      });
    }
  }),
});

http.route({
  path: "/revenue/smiirl",
  method: "GET",
  handler: httpAction(async (ctx) => {
    console.log("[revenue/smiirl] received");
    try {
      // New-format verified snapshots always win. A legacy row is used only
      // until the first verified collector run so rollout cannot blank the
      // physical counter.
      const snapshot = await ctx.runQuery(internal.revenue.latestSnapshotInternal, {});
      if (!snapshot) {
        return new Response(JSON.stringify({ error: "Revenue snapshot unavailable" }), {
          status: 503,
          headers: {
            "Content-Type": "application/json",
            "Cache-Control": "no-store, max-age=0",
          },
        });
      }
      // Smiirl counter expects { "number": <int> }
      return new Response(JSON.stringify({ number: Math.round(snapshot.totalYtdUsd) }), {
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-store, max-age=0",
          "X-Revenue-Dataset": snapshot.collectorRunId ?? 'legacy',
        },
      });
    } catch (e) {
      console.error("[revenue/smiirl] error:", e instanceof Error ? e.message : String(e));
      return new Response(JSON.stringify({ error: "Revenue snapshot unavailable" }), {
        status: 503,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-store, max-age=0",
        },
      });
    }
  }),
});

http.route({
  path: "/revenue/refresh-close",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    console.log("[revenue/refresh-close] received");
    if (!checkActivityToken(req)) return unauthorizedResponse();
    try {
      const result = await ctx.runAction(
        internal.revenue.refreshCloseDiagnosticInternal,
        {},
      );
      console.log("[revenue/refresh-close] non-authoritative diagnostic completed:", result);
      return new Response(JSON.stringify({ ok: true, ...result }), {
        headers: { "Content-Type": "application/json" },
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[revenue/refresh-close] error:", msg);
      return new Response(JSON.stringify({ ok: false, error: msg }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
  }),
});

// ── Close webhook ─────────────────────────────────────────────────────────────

http.route({
  path: "/revenue/close-webhook",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    console.log("[close-webhook] request received");
    const signatureKey = process.env.CLOSE_WEBHOOK_SIGNATURE_KEY;
    if (!signatureKey) {
      console.error("[close-webhook] CLOSE_WEBHOOK_SIGNATURE_KEY env var not set");
      return new Response("Server configuration error", { status: 503 });
    }

    const rawBody = await req.text();
    try {
      if (!(await verifyCloseWebhookSignature(req, rawBody, signatureKey))) {
        console.warn("[close-webhook] invalid or missing signature");
        return unauthorizedResponse();
      }
    } catch (e) {
      console.error(
        "[close-webhook] signature verification error:",
        e instanceof Error ? e.message : String(e),
      );
      return new Response("Signature verification failed", { status: 500 });
    }

    let payload: {
      event?: {
        object_type?: string;
        action?: string;
        data?: Record<string, unknown>;
        previous_data?: Record<string, unknown>;
      };
    };
    try {
      payload = JSON.parse(rawBody);
    } catch (e) {
      console.error("[close-webhook] JSON parse failed:", e instanceof Error ? e.message : String(e));
      return new Response("Bad request — invalid JSON", { status: 400 });
    }

    const event = payload.event ?? {};
    const statusType = event.data?.status_type;
    const previousStatusType = event.previous_data?.status_type;
    const affectsWonRevenue =
      event.object_type === "opportunity" &&
      (statusType === "won" || previousStatusType === "won");

    if (!affectsWonRevenue) {
      console.log(
        `[close-webhook] no won-revenue change for object_type="${event.object_type}" action="${event.action}"`,
      );
      return new Response("ok", { status: 200 });
    }

    try {
      const result = await ctx.runAction(
        internal.revenue.refreshCloseDiagnosticInternal,
        {},
      );
      console.log("[close-webhook] non-authoritative Close diagnostic complete:", result);
      return new Response(JSON.stringify({ ok: true, ...result }), {
        headers: { "Content-Type": "application/json" },
      });
    } catch (e) {
      console.error(
        "[close-webhook] Close diagnostic failed:",
        e instanceof Error ? e.message : String(e),
      );
      // Close retries failed webhook deliveries, so surface refresh failures.
      return new Response("Close diagnostic failed", { status: 500 });
    }
  }),
});

// ── Proposals ─────────────────────────────────────────────────────────────────

http.route({
  path: "/proposals/upsert",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    console.log("[proposals/upsert] received");
    try {
      const body = await req.json();
      await ctx.runMutation(internal.proposals.upsertProposalInternal, body);
      return new Response("ok", { status: 200 });
    } catch (e) {
      console.error("[proposals/upsert] error:", e instanceof Error ? e.message : String(e));
      return new Response("error", { status: 500 });
    }
  }),
});

// ── Memory docs ───────────────────────────────────────────────────────────────

http.route({
  path: "/memory/upsert",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    console.log("[memory/upsert] received");
    try {
      const body = await req.json();
      await ctx.runMutation(internal.memoryDocs.upsertDocInternal, body);
      return new Response("ok", { status: 200 });
    } catch (e) {
      console.error("[memory/upsert] error:", e instanceof Error ? e.message : String(e));
      return new Response("error", { status: 500 });
    }
  }),
});

http.route({
  path: "/memory/pending-writes",
  method: "GET",
  handler: httpAction(async (ctx, req) => {
    try {
      const token =
        req.headers.get("x-activity-token") ??
        req.headers.get("authorization")?.replace("Bearer ", "");
      const items = await ctx.runQuery(internal.memoryDocs.getPendingWritesInternal, {
        authToken: token ?? undefined,
      });
      return new Response(JSON.stringify(items), {
        headers: { "Content-Type": "application/json" },
      });
    } catch (e) {
      console.error("[memory/pending-writes] error:", e instanceof Error ? e.message : String(e));
      return new Response("error", { status: 500 });
    }
  }),
});

http.route({
  path: "/memory/resolve-write",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    console.log("[memory/resolve-write] received");
    try {
      const body = await req.json();
      await ctx.runMutation(internal.memoryDocs.resolveWriteInternal, body);
      return new Response("ok", { status: 200 });
    } catch (e) {
      console.error("[memory/resolve-write] error:", e instanceof Error ? e.message : String(e));
      return new Response("error", { status: 500 });
    }
  }),
});

http.route({
  path: "/memory/prune",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    console.log("[memory/prune] received");
    if (!checkActivityToken(req)) return unauthorizedResponse();
    try {
      const body = await req.json();
      await ctx.runMutation(internal.memoryDocs.deleteStaleDocs, body);
      return new Response("ok", { status: 200 });
    } catch (e) {
      console.error("[memory/prune] error:", e instanceof Error ? e.message : String(e));
      return new Response("error", { status: 500 });
    }
  }),
});

// ── Calendar ──────────────────────────────────────────────────────────────────

http.route({
  path: "/calendar/upsert",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    console.log("[calendar/upsert] received");
    try {
      const body = await req.json();
      await ctx.runMutation(internal.calendarEvents.upsertEventInternal, body);
      return new Response("ok", { status: 200 });
    } catch (e) {
      console.error("[calendar/upsert] error:", e instanceof Error ? e.message : String(e));
      return new Response("error", { status: 500 });
    }
  }),
});

http.route({
  path: "/calendar/prune",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    console.log("[calendar/prune] received");
    try {
      const body = await req.json();
      await ctx.runMutation(internal.calendarEvents.deleteStaleEventsInternal, body);
      return new Response("ok", { status: 200 });
    } catch (e) {
      console.error("[calendar/prune] error:", e instanceof Error ? e.message : String(e));
      return new Response("error", { status: 500 });
    }
  }),
});

// ── Pipeline stats ────────────────────────────────────────────────────────────

http.route({
  path: "/pipeline-stats",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    console.log("[pipeline-stats] received");
    try {
      const body = await req.json();
      await ctx.runMutation(internal.pipelineStats.upsertPipelineStatsInternal, body);
      return new Response("ok", { status: 200 });
    } catch (e) {
      console.error("[pipeline-stats] error:", e instanceof Error ? e.message : String(e));
      return new Response("error", { status: 500 });
    }
  }),
});

export default http;
