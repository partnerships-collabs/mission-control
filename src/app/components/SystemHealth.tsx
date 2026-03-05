'use client';

import Link from "next/link";
import { useEffect, useState } from "react";

interface CronJob {
  lastStatus: string;
  consecutiveErrors: number;
}

type HealthStatus = "green" | "yellow" | "red";

const statusColors = {
  green: { dot: "bg-emerald-400", text: "text-emerald-400", bg: "bg-emerald-500/5 border-emerald-500/20" },
  yellow: { dot: "bg-yellow-400", text: "text-yellow-400", bg: "bg-yellow-500/5 border-yellow-500/20" },
  red: { dot: "bg-red-400", text: "text-red-400", bg: "bg-red-500/5 border-red-500/20" },
};

export function SystemHealth() {
  const [cronHealth, setCronHealth] = useState<{ status: HealthStatus; label: string }>({ status: "green", label: "Loading…" });
  const [agentCount, setAgentCount] = useState<number | null>(null);

  useEffect(() => {
    // Fetch cron health
    fetch('/api/crons')
      .then(r => r.json())
      .then((jobs: CronJob[]) => {
        const errorCount = jobs.filter(j => j.lastStatus === "error" || j.consecutiveErrors >= 3).length;
        if (errorCount > 5) setCronHealth({ status: "red", label: `${errorCount} errors` });
        else if (errorCount >= 1) setCronHealth({ status: "yellow", label: `${errorCount} warning${errorCount > 1 ? "s" : ""}` });
        else setCronHealth({ status: "green", label: "All healthy" });
      })
      .catch(() => setCronHealth({ status: "yellow", label: "Unknown" }));

    // Fetch agent count
    fetch('/api/agents')
      .then(r => r.json())
      .then((agents: unknown[]) => setAgentCount(agents.length))
      .catch(() => setAgentCount(3));
  }, []);

  const indicators = [
    {
      name: "Agents",
      status: "green" as HealthStatus,
      label: agentCount !== null ? `${agentCount} active` : "Loading…",
      href: "/agents",
    },
    {
      name: "Crons",
      status: cronHealth.status,
      label: cronHealth.label,
      href: "/crons",
    },
    {
      name: "Infrastructure",
      status: "green" as HealthStatus,
      label: "Online",
      href: "/infrastructure",
    },
  ];

  return (
    <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-5">
      <h2 className="text-base font-semibold text-slate-100 mb-4">System Health</h2>

      <div className="grid grid-cols-3 gap-4">
        {indicators.map((ind) => {
          const colors = statusColors[ind.status];
          return (
            <Link
              key={ind.name}
              href={ind.href}
              className={`rounded-lg border p-4 transition-all hover:bg-slate-800/40 ${colors.bg}`}
            >
              <div className="flex items-center gap-2 mb-2">
                <div className={`w-2.5 h-2.5 rounded-full ${colors.dot} ${ind.status !== "green" ? "animate-pulse" : ""}`}></div>
                <span className="text-sm font-medium text-slate-200">{ind.name}</span>
              </div>
              <div className={`text-xs ${colors.text}`}>{ind.label}</div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
