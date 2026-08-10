import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";

const http = httpRouter();

// ── Auth helper ───────────────────────────────────────────────────────────────

function checkActivityToken(req: Request): boolean {
  const token =
    req.headers.get("x-activity-token") ??
    req.headers.get("authorization")?.replace("Bearer ", "");
  return token === process.env.ACTIVITY_LOG_SECRET;
}

// ── Health ────────────────────────────────────────────────────────────────────

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
  path: "/revenue/snapshot",
  method: "GET",
  handler: httpAction(async (ctx) => {
    console.log("[revenue/snapshot GET] received");
    try {
      const snapshot = await ctx.runQuery(internal.revenue.latestSnapshotInternal, {});
      return new Response(JSON.stringify(snapshot ?? null), {
        headers: { "Content-Type": "application/json" },
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
    console.log("[revenue/snapshot POST] received");
    try {
      const body = await req.json();
      await ctx.runMutation(internal.revenue.upsertSnapshotInternal, body);
      return new Response("ok", { status: 200 });
    } catch (e) {
      console.error("[revenue/snapshot POST] error:", e instanceof Error ? e.message : String(e));
      return new Response("error", { status: 500 });
    }
  }),
});

http.route({
  path: "/revenue/smiirl",
  method: "GET",
  handler: httpAction(async (ctx) => {
    console.log("[revenue/smiirl] received");
    try {
      const snapshot = await ctx.runQuery(internal.revenue.latestSnapshotInternal, {});
      const value = snapshot?.totalYtdUsd ?? 0;
      // Smiirl counter expects { "number": <int> }
      return new Response(JSON.stringify({ number: Math.round(value) }), {
        headers: { "Content-Type": "application/json" },
      });
    } catch (e) {
      console.error("[revenue/smiirl] error:", e instanceof Error ? e.message : String(e));
      return new Response(JSON.stringify({ number: 0 }), {
        headers: { "Content-Type": "application/json" },
      });
    }
  }),
});

http.route({
  path: "/revenue/refresh-close",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    console.log("[revenue/refresh-close] received");
    try {
      const result = await ctx.runAction(internal.revenue.refreshFromCloseInternal, {});
      console.log("[revenue/refresh-close] completed:", result);
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

    let rawBody: string;
    try {
      rawBody = await req.text();
    } catch (e) {
      console.error("[close-webhook] failed to read body:", e instanceof Error ? e.message : String(e));
      return new Response("Bad request", { status: 400 });
    }

    console.log(`[close-webhook] body length=${rawBody.length}`);

    // Verify HMAC-SHA256 signature
    const sigHeader =
      req.headers.get("X-Close-Signature-256") ??
      req.headers.get("x-close-signature-256") ??
      req.headers.get("X-Close-Signature") ??
      req.headers.get("x-close-signature");

    console.log(`[close-webhook] signature header present=${!!sigHeader} header-name check done`);

    const secret = process.env.CLOSE_WEBHOOK_SIGNATURE_KEY;
    if (!secret) {
      console.error("[close-webhook] CLOSE_WEBHOOK_SIGNATURE_KEY env var not set");
      return new Response("Server configuration error", { status: 500 });
    }

    if (sigHeader) {
      try {
        const key = await crypto.subtle.importKey(
          "raw",
          new TextEncoder().encode(secret),
          { name: "HMAC", hash: "SHA-256" },
          false,
          ["sign"]
        );
        const sigBuffer = await crypto.subtle.sign(
          "HMAC",
          key,
          new TextEncoder().encode(rawBody)
        );
        const expectedHex = Array.from(new Uint8Array(sigBuffer))
          .map((b) => b.toString(16).padStart(2, "0"))
          .join("");

        const receivedHex = sigHeader.startsWith("sha256=")
          ? sigHeader.slice(7)
          : sigHeader;

        if (receivedHex !== expectedHex) {
          console.error(
            `[close-webhook] signature mismatch received=${receivedHex.slice(0, 10)}... expected=${expectedHex.slice(0, 10)}...`
          );
          return new Response("Unauthorized", { status: 401 });
        }
        console.log("[close-webhook] signature verified ok");
      } catch (e) {
        console.error("[close-webhook] signature verification error:", e instanceof Error ? e.message : String(e));
        return new Response("Signature verification failed", { status: 500 });
      }
    } else {
      console.warn("[close-webhook] no signature header — proceeding without verification");
    }

    // Parse payload — Close webhook shape:
    // { subscription_id, event: { object_type, action, data: { status_type, ... }, changed_fields } }
    let payload: {
      subscription_id?: string;
      event?: {
        id?: string;
        object_type?: string;
        action?: string;
        changed_fields?: string[];
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
    console.log(
      `[close-webhook] subscription_id="${payload.subscription_id}" object_type="${event.object_type}" action="${event.action}" changed_fields=${JSON.stringify(event.changed_fields ?? [])}`
    );

    // Trigger revenue refresh on won opportunity events
    if (event.object_type === "opportunity") {
      const data = event.data ?? {};
      const statusType = data.status_type as string | undefined;
      const prevStatusType = (event.previous_data?.status_type ?? "") as string;
      console.log(
        `[close-webhook] opportunity event status_type="${statusType}" prev="${prevStatusType}" action="${event.action}"`
      );

      if (statusType === "won") {
        console.log("[close-webhook] deal won — triggering Close revenue refresh");
        try {
          const result = await ctx.runAction(internal.revenue.refreshFromCloseInternal, {});
          console.log("[close-webhook] revenue refresh complete:", result);
        } catch (e) {
          // Log but don't fail the webhook — Close retries on 5xx
          console.error("[close-webhook] revenue refresh failed:", e instanceof Error ? e.message : String(e));
        }
      } else {
        console.log(`[close-webhook] skipping refresh for status_type="${statusType}"`);
      }
    } else {
      console.log(`[close-webhook] ignoring object_type="${event.object_type}"`);
    }

    console.log("[close-webhook] returning 200 ok");
    return new Response("ok", { status: 200 });
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
