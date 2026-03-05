import { NextResponse } from "next/server";
import { execSync } from "child_process";

interface RawCronJob {
  id: string;
  name: string;
  agentId?: string;
  schedule?: {
    kind?: string;
    expr?: string;
  };
  state?: {
    lastStatus?: string;
    lastRunAtMs?: number;
    lastDurationMs?: number;
    consecutiveErrors?: number;
    nextRunAtMs?: number;
    lastError?: string;
  };
}

export interface CronJob {
  id: string;
  name: string;
  agent: string;
  schedule: string;
  lastStatus: "success" | "warning" | "error";
  lastRun: string;
  consecutiveErrors: number;
  errorMessage?: string;
  duration: string;
  nextRun: string;
}

function msAgo(ms: number | undefined): string {
  if (!ms) return "never";
  const diffMs = Date.now() - ms;
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin} mins ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  return `${Math.floor(diffHr / 24)}d ago`;
}

function formatDuration(ms: number | undefined): string {
  if (!ms && ms !== 0) return "—";
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

function formatNextRun(ms: number | undefined): string {
  if (!ms) return "—";
  const diffMs = ms - Date.now();
  if (diffMs <= 0) return "now";
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 60) return `In ${diffMin} mins`;
  return `In ${Math.floor(diffMin / 60)}h`;
}

function mapAgent(agentId: string | undefined): string {
  switch (agentId) {
    case "main": return "Ari";
    case "axel": return "Axel";
    case "arlo": return "Arlo";
    default: return agentId || "Ari";
  }
}

function mapStatus(state: RawCronJob["state"]): "success" | "warning" | "error" {
  const s = state?.lastStatus;
  if (s === "ok" || s === "success") {
    return state?.consecutiveErrors && state.consecutiveErrors > 0 ? "warning" : "success";
  }
  if (s === "error") return "error";
  return "warning";
}

export async function GET() {
  try {
    const raw = execSync("openclaw cron list --json", {
      timeout: 10000,
      env: { ...process.env, PATH: "/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin" },
    }).toString();

    const data = JSON.parse(raw);
    const jobs: RawCronJob[] = data.jobs || [];

    const mapped: CronJob[] = jobs.map((j) => ({
      id: j.id,
      name: j.name,
      agent: mapAgent(j.agentId),
      schedule: j.schedule?.expr || j.schedule?.kind || "—",
      lastStatus: mapStatus(j.state),
      lastRun: msAgo(j.state?.lastRunAtMs),
      consecutiveErrors: j.state?.consecutiveErrors || 0,
      errorMessage: j.state?.lastError,
      duration: formatDuration(j.state?.lastDurationMs),
      nextRun: formatNextRun(j.state?.nextRunAtMs),
    }));

    return NextResponse.json(mapped);
  } catch (err) {
    console.error("Crons route error:", err);
    return NextResponse.json([]);
  }
}
