import { NextResponse } from "next/server";
import { execSync } from "child_process";

interface AgentInfo {
  id: string;
  name: string;
  model: string;
  uptime: string;
  lastActivity: string;
}

const FALLBACK: AgentInfo[] = [
  { id: "ari",  name: "Ari",  model: "Sonnet 4.6", uptime: "—", lastActivity: "—" },
  { id: "arlo", name: "Arlo", model: "Sonnet 4.6", uptime: "—", lastActivity: "—" },
  { id: "axel", name: "Axel", model: "Sonnet 4.6", uptime: "—", lastActivity: "—" },
];

function parseOpenclawStatus(output: string): AgentInfo[] | null {
  try {
    // openclaw status outputs JSON or a structured format — try JSON first
    const parsed = JSON.parse(output);
    if (Array.isArray(parsed)) {
      return parsed.map((a: Record<string, string>) => ({
        id: (a.name || a.id || "").toLowerCase(),
        name: a.name || a.id || "",
        model: a.model || "Sonnet 4.6",
        uptime: "—",
        lastActivity: a.lastActivity || a.last_activity || "—",
      }));
    }
  } catch {
    // Not JSON — return null, use fallback
  }
  return null;
}

export async function GET() {
  try {
    const raw = execSync("openclaw status --json", {
      timeout: 5000,
      env: { ...process.env, PATH: "/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin" },
    }).toString();
    const agents = parseOpenclawStatus(raw);
    if (agents) return NextResponse.json(agents);
  } catch {
    // openclaw not available or failed — use fallback
  }
  return NextResponse.json(FALLBACK);
}
