'use client';

import Link from "next/link";
import { useEffect, useState } from "react";

interface CronJob {
  id: string;
  name: string;
  agent: string;
  lastStatus: 'success' | 'warning' | 'error';
  consecutiveErrors: number;
  lastRun: string;
  duration: string;
}

export function RecentActivityHome() {
  const [jobs, setJobs] = useState<CronJob[]>([]);

  useEffect(() => {
    fetch('/api/crons')
      .then(r => r.json())
      .then((data: CronJob[]) => {
        // Sort by most recently run (jobs with "mins ago" first, then hours, then days)
        const sorted = [...data]
          .filter(j => j.lastRun !== "never" && j.lastRun !== "—")
          .sort((a, b) => {
            const toMin = (s: string) => {
              if (s === "just now") return 0;
              const mMatch = s.match(/(\d+)\s*min/);
              if (mMatch) return parseInt(mMatch[1]);
              const hMatch = s.match(/(\d+)h/);
              if (hMatch) return parseInt(hMatch[1]) * 60;
              const dMatch = s.match(/(\d+)d/);
              if (dMatch) return parseInt(dMatch[1]) * 1440;
              return 9999;
            };
            return toMin(a.lastRun) - toMin(b.lastRun);
          })
          .slice(0, 5);
        setJobs(sorted);
      })
      .catch(() => setJobs([]));
  }, []);

  return (
    <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base font-semibold text-slate-100">Recent Activity</h2>
        <Link href="/activity" className="text-xs text-emerald-400 hover:text-emerald-300">
          View all →
        </Link>
      </div>

      {jobs.length === 0 ? (
        <p className="text-sm text-slate-500 py-2">Loading recent activity…</p>
      ) : (
        <div className="space-y-2">
          {jobs.map((job) => (
            <div
              key={job.id}
              className="flex items-center gap-3 py-2 px-3 rounded-lg bg-slate-800/30 border border-slate-800/50"
            >
              <div
                className={`w-2 h-2 rounded-full shrink-0 ${
                  job.lastStatus === "success" && job.consecutiveErrors === 0
                    ? "bg-emerald-400"
                    : job.lastStatus === "error" || job.consecutiveErrors >= 3
                      ? "bg-red-400"
                      : "bg-yellow-400"
                }`}
              ></div>
              <div className="flex-1 min-w-0">
                <span className="text-sm text-slate-200 truncate block">{job.name}</span>
              </div>
              <span className="text-xs text-slate-500 shrink-0">{job.agent}</span>
              <span className="text-xs text-slate-600 shrink-0">{job.lastRun}</span>
              <span
                className={`text-xs font-medium shrink-0 ${
                  job.lastStatus === "success" && job.consecutiveErrors === 0
                    ? "text-emerald-400"
                    : job.lastStatus === "error" || job.consecutiveErrors >= 3
                      ? "text-red-400"
                      : "text-yellow-400"
                }`}
              >
                {job.consecutiveErrors >= 3 ? "error" : job.lastStatus}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
