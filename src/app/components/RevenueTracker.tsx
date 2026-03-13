"use client";

import { useEffect, useState } from "react";

interface RevenueData {
  totalYtdUsd: number;
  goalUsd: number;
  last30DayUsd: number;
  projectedAnnualUsd: number;
  sources: {
    copper: number; // API route returns this key for backward compat; powered by Close CRM
    impact: number | null;
    redVentures: number | null;
    adsByMoney: number | null;
    msn: number | null;
  };
  updatedAt: string;
  error?: string;
}

function fmt(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toLocaleString()}`;
}

export function RevenueTracker() {
  const [data, setData] = useState<RevenueData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/revenue")
      .then((r) => r.json())
      .then((d) => {
        setData(d);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const totalYtdUsd = data?.totalYtdUsd ?? 0;
  const goalUsd = data?.goalUsd ?? 25_000_000;
  const pct = Math.min(Math.round((totalYtdUsd / goalUsd) * 100), 100);

  const sources = [
    { label: "Close", value: data?.sources?.copper ?? null, live: true },
    { label: "Impact", value: null, live: false },
    { label: "RedVentures", value: null, live: false },
    { label: "AdsByMoney", value: null, live: false },
    { label: "MSN", value: null, live: false },
  ];

  return (
    <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base font-semibold text-slate-100">Revenue Tracker</h2>
        <div className="flex items-center gap-2">
          <span className="text-xs text-emerald-400 font-medium">Powered by Close</span>
          <span className="text-xs text-slate-500">YTD 2026</span>
        </div>
      </div>

      {loading ? (
        <div className="h-16 flex items-center">
          <span className="text-slate-500 text-sm animate-pulse">Loading revenue data…</span>
        </div>
      ) : (
        <>
          <div className="flex items-end gap-2 mb-1">
            <span className="text-3xl font-bold text-slate-100">
              {fmt(totalYtdUsd)}
            </span>
            <span className="text-sm text-slate-500 mb-1">of $25M goal</span>
          </div>

          {data?.projectedAnnualUsd ? (
            <p className="text-xs text-emerald-400 mb-3">
              Run rate: {fmt(data.projectedAnnualUsd)}/yr based on last 30 days
            </p>
          ) : (
            <p className="text-xs text-slate-500 mb-3">No recent activity for run rate projection</p>
          )}

          {/* Progress bar */}
          <div className="w-full bg-slate-800 rounded-full h-3 mb-3 overflow-hidden">
            <div
              className="h-3 rounded-full bg-gradient-to-r from-emerald-500 to-emerald-400 transition-all duration-500"
              style={{ width: `${Math.max(pct, 0.5)}%` }}
            ></div>
          </div>

          <div className="flex items-center justify-between text-xs mb-4">
            <span className="text-slate-500">{pct}% of goal</span>
            {data?.updatedAt && (
              <span className="text-slate-600">
                Updated {new Date(data.updatedAt).toLocaleTimeString()}
              </span>
            )}
          </div>
        </>
      )}

      {/* Source indicators */}
      <div className="mt-2 grid grid-cols-5 gap-2">
        {sources.map((src) => (
          <div key={src.label} className="text-center">
            <div className={`text-xs mb-1 ${src.live ? "text-emerald-400" : "text-slate-600"}`}>
              {src.label}
            </div>
            {src.live ? (
              <div className="text-xs font-mono text-slate-300">
                {src.value != null ? fmt(src.value) : "—"}
              </div>
            ) : (
              <div className="text-xs text-slate-600 italic">pending</div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
