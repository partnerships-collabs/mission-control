'use client';

import { useState, useEffect } from "react";

interface CronJob {
  id: string;
  name: string;
  agent: string;
  lastStatus: 'success' | 'warning' | 'error';
  consecutiveErrors: number;
  lastRun: string;
  duration: string;
  errorMessage?: string;
}

function parseRelativeTime(str: string): number {
  if (str === "never" || str === "—") return -Infinity;
  if (str === "just now") return 0;
  const match = str.match(/(\d+)\s*(min|mins|hour|hours|day|days|hrs|h|d)/);
  if (!match) return 0;
  const n = parseInt(match[1], 10);
  const unit = match[2];
  if (unit.startsWith("min")) return -n;
  if (unit.startsWith("hour") || unit === "hrs" || unit === "h") return -n * 60;
  if (unit.startsWith("day") || unit === "d") return -n * 1440;
  return 0;
}

type AgentFilter = "" | "Ari" | "Arlo" | "Axel";
type StatusFilter = "" | "success" | "error" | "warning";

function getStatusStyle(job: CronJob) {
  if (job.lastStatus === "error" || job.consecutiveErrors >= 3) {
    return { dot: "bg-red-400", text: "text-red-400", label: "error" };
  }
  if (job.consecutiveErrors >= 1 || job.lastStatus === "warning") {
    return { dot: "bg-yellow-400", text: "text-yellow-400", label: "warning" };
  }
  return { dot: "bg-emerald-400", text: "text-emerald-400", label: "success" };
}

export function ActivityFeed() {
  const [jobs, setJobs] = useState<CronJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [agentFilter, setAgentFilter] = useState<AgentFilter>("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("");

  useEffect(() => {
    fetch('/api/crons')
      .then(r => r.json())
      .then((data: CronJob[]) => { setJobs(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const filtered = jobs
    .filter((j) => j.lastRun !== "never" && j.lastRun !== "—")
    .filter((j) => !agentFilter || j.agent === agentFilter)
    .filter((j) => {
      if (!statusFilter) return true;
      if (statusFilter === "error") return j.lastStatus === "error" || j.consecutiveErrors >= 3;
      if (statusFilter === "success") return j.lastStatus === "success" && j.consecutiveErrors === 0;
      return j.lastStatus === statusFilter;
    })
    .sort((a, b) => parseRelativeTime(b.lastRun) - parseRelativeTime(a.lastRun))
    .slice(0, 20);

  return (
    <>
      {/* Filters */}
      <div className="flex gap-3">
        <select
          value={agentFilter}
          onChange={(e) => setAgentFilter(e.target.value as AgentFilter)}
          className="bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-300 focus:outline-none focus:border-emerald-500/40"
        >
          <option value="">All Agents</option>
          <option value="Ari">Ari</option>
          <option value="Arlo">Arlo</option>
          <option value="Axel">Axel</option>
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
          className="bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-300 focus:outline-none focus:border-emerald-500/40"
        >
          <option value="">All Statuses</option>
          <option value="success">Success</option>
          <option value="error">Error</option>
          <option value="warning">Warning</option>
        </select>
      </div>

      {/* Activity List */}
      <div className="bg-slate-900/50 border border-slate-800 rounded-xl overflow-hidden">
        <div className="divide-y divide-slate-800/50">
          {loading ? (
            <div className="px-5 py-8 text-center text-sm text-slate-500 animate-pulse">
              Loading activity…
            </div>
          ) : filtered.length === 0 ? (
            <div className="px-5 py-8 text-center text-sm text-slate-500">
              No activity matches the current filters.
            </div>
          ) : (
            filtered.map((job) => {
              const style = getStatusStyle(job);
              return (
                <div
                  key={job.id}
                  className="flex items-center gap-4 px-5 py-3.5 hover:bg-slate-800/30 transition-colors"
                >
                  <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${style.dot}`}></div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-slate-200 truncate">{job.name}</div>
                    {job.errorMessage && (
                      <div className="text-xs text-red-400/80 mt-0.5 truncate">{job.errorMessage}</div>
                    )}
                  </div>
                  <span className="text-xs text-slate-500 shrink-0 w-12">{job.agent}</span>
                  <span className="text-xs text-slate-600 shrink-0 w-24 text-right">{job.lastRun}</span>
                  <span className="text-xs text-slate-600 shrink-0 w-16 text-right">{job.duration}</span>
                  <span className={`text-xs font-medium shrink-0 w-14 text-right ${style.text}`}>
                    {style.label}
                  </span>
                </div>
              );
            })
          )}
        </div>
      </div>
    </>
  );
}
