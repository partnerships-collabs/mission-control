'use client';

import { useEffect, useState } from "react";

interface Stat {
  label: string;
  value: string;
}

export function PipelineStats() {
  const [stats, setStats] = useState<Stat[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/pipeline-stats')
      .then(r => r.json())
      .then(data => {
        setStats(data.topStats || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  return (
    <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
      <h3 className="text-lg font-semibold text-slate-100 mb-4">Pipeline Stats</h3>

      {loading ? (
        <div className="text-sm text-slate-500 animate-pulse">Loading…</div>
      ) : (
        <div className="grid grid-cols-2 gap-4">
          {stats.map((stat) => (
            <div key={stat.label} className="space-y-2">
              <div className="text-sm text-slate-400">{stat.label}</div>
              <div className="text-xl font-semibold text-slate-100">{stat.value}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
