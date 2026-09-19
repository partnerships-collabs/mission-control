import assert from "node:assert/strict";

const siteUrl = (process.env.CONVEX_SITE_URL ?? "https://healthy-bison-550.convex.site").replace(
  /\/$/,
  "",
);
const attempts = Number.parseInt(process.env.SMOKE_ATTEMPTS ?? "12", 10);
const delayMs = Number.parseInt(process.env.SMOKE_DELAY_MS ?? "5000", 10);
const probe = encodeURIComponent(process.env.GITHUB_SHA ?? `manual-${Date.now()}`);

async function checkProduction() {
  const smiirl = await fetch(`${siteUrl}/revenue/smiirl?deploy_probe=${probe}`, {
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(10_000),
  });
  const smiirlBody = await smiirl.json().catch(() => null);
  const snapshot = await fetch(`${siteUrl}/revenue/snapshot?deploy_probe=${probe}`, {
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(10_000),
  });
  const revenueHealth = await fetch(`${siteUrl}/revenue/health?deploy_probe=${probe}`, {
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(10_000),
  });
  const unsignedCollectionRun = await fetch(
    `${siteUrl}/revenue/collection-run?deploy_probe=${probe}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
      redirect: "error",
      signal: AbortSignal.timeout(10_000),
    },
  );
  const unsignedWebhook = await fetch(
    `${siteUrl}/revenue/close-webhook?deploy_probe=${probe}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
      redirect: "error",
      signal: AbortSignal.timeout(10_000),
    },
  );

  const allTime = await fetch(`${siteUrl}/revenue/all-time?deploy_probe=${probe}`, {
    redirect: "error", signal: AbortSignal.timeout(10_000),
  });
  const allTimeCollectionRun = await fetch(`${siteUrl}/revenue/all-time/collection-run?deploy_probe=${probe}`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: "{}",
    redirect: "error", signal: AbortSignal.timeout(10_000),
  });
  const mondayStatuses = await Promise.all([
    ['/revenue/monday/audit', 'GET'], ['/revenue/monday/chunk', 'POST'], ['/revenue/monday/complete', 'POST'],
    ['/revenue/unified/collection-run', 'POST'],
    ['/revenue/reconciliation/chunk','POST'], ['/revenue/reconciliation/complete','POST'],
    ['/revenue/realtime/configure','POST'], ['/revenue/realtime/status','GET'], ['/revenue/realtime/shadow','GET'],
  ].map(async ([path, method]) => (await fetch(`${siteUrl}${path}`, {method, ...(method === 'POST' ? {body:'{}',headers:{'Content-Type':'application/json'}} : {}),
    redirect:'error',signal:AbortSignal.timeout(10_000)})).status));

  return {
    mondayStatuses,
    allTimeStatus: allTime.status,
    allTimeCollectionRunStatus: allTimeCollectionRun.status,
    number: smiirlBody?.number,
    smiirlCacheControl: smiirl.headers.get("cache-control"),
    smiirlContentType: smiirl.headers.get("content-type"),
    smiirlKeys:
      smiirlBody && typeof smiirlBody === "object" ? Object.keys(smiirlBody).sort() : [],
    smiirlStatus: smiirl.status,
    snapshotStatus: snapshot.status,
    revenueHealthStatus: revenueHealth.status,
    collectionRunStatus: unsignedCollectionRun.status,
    webhookStatus: unsignedWebhook.status,
  };
}

let lastResult;
for (let attempt = 1; attempt <= attempts; attempt += 1) {
  try {
    lastResult = await checkProduction();
  } catch (error) {
    lastResult = { error: error instanceof Error ? error.message : String(error) };
  }

  const ready =
    lastResult.mondayStatuses?.every(status => status === 401) &&
    lastResult.smiirlStatus === 200 &&
    Number.isSafeInteger(lastResult.number) &&
    lastResult.smiirlKeys?.length === 1 &&
    lastResult.smiirlKeys[0] === "number" &&
    lastResult.smiirlContentType?.toLowerCase().includes("application/json") &&
    lastResult.smiirlCacheControl?.toLowerCase().includes("no-store") &&
    lastResult.snapshotStatus === 401 &&
    lastResult.revenueHealthStatus === 401 &&
    lastResult.collectionRunStatus === 401 &&
    lastResult.webhookStatus === 401 &&
    lastResult.allTimeStatus === 401 &&
    lastResult.allTimeCollectionRunStatus === 401;

  if (ready) {
    console.log(
      `Convex production verified: Smiirl ${lastResult.number}; protected routes reject unsigned requests.`,
    );
    process.exit(0);
  }

  if (attempt < attempts) {
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
}

assert.fail(`Convex production did not reach the expected state: ${JSON.stringify(lastResult)}`);
