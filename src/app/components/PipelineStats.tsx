import { topStats } from "@/app/pipeline/pipeline-data";

export function PipelineStats() {
  return (
    <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
      <h3 className="text-lg font-semibold text-slate-100 mb-4">Pipeline Stats</h3>

      <div className="grid grid-cols-2 gap-4">
        {topStats.map((stat) => (
          <div key={stat.label} className="space-y-2">
            <div className="text-sm text-slate-400">{stat.label}</div>
            <div className="text-xl font-semibold text-slate-100">{stat.value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
