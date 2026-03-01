import { cronJobs } from '../data/real-cron-data';

export function RecentCronActivity() {
  const recentRuns = cronJobs
    .sort((a, b) => new Date(b.lastRun).getTime() - new Date(a.lastRun).getTime())
    .slice(0, 10)
    .map(job => ({
      name: job.name,
      agent: job.agent,
      ranAt: formatTimeAgo(new Date(job.lastRun)),
      duration: job.duration,
      status: job.lastStatus
    }));

  function formatTimeAgo(date: Date): string {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));

    if (diffMins < 60) {
      return `${diffMins}m ago`;
    }
    const diffHours = Math.floor(diffMins / 60);
    return `${diffHours}h ago`;
  }

  return (
    <div className="bg-zinc-800 border border-zinc-700 rounded-lg">
      <div className="px-6 py-4 border-b border-zinc-700">
        <h3 className="text-lg font-semibold text-zinc-100">Recent Cron Runs</h3>
        <p className="text-sm text-zinc-400">Last 10 jobs by run time</p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-zinc-700">
              <th className="text-left px-6 py-3 text-xs font-medium text-zinc-500 uppercase tracking-wider">Job Name</th>
              <th className="text-left px-6 py-3 text-xs font-medium text-zinc-500 uppercase tracking-wider">Agent</th>
              <th className="text-left px-6 py-3 text-xs font-medium text-zinc-500 uppercase tracking-wider">Ran At</th>
              <th className="text-right px-6 py-3 text-xs font-medium text-zinc-500 uppercase tracking-wider">Duration</th>
              <th className="text-right px-6 py-3 text-xs font-medium text-zinc-500 uppercase tracking-wider">Status</th>
            </tr>
          </thead>
          <tbody>
            {recentRuns.map((run, index) => (
              <tr key={index} className="border-b border-zinc-700/50 hover:bg-zinc-700/30">
                <td className="px-6 py-3 text-sm text-zinc-200">{run.name}</td>
                <td className="px-6 py-3 text-sm text-zinc-400">{run.agent}</td>
                <td className="px-6 py-3 text-sm text-zinc-400">{run.ranAt}</td>
                <td className="px-6 py-3 text-sm text-zinc-400 text-right">{run.duration}</td>
                <td className="px-6 py-3 text-right">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                    run.status === "ok"
                      ? "bg-green-500/15 text-green-400"
                      : "bg-red-500/15 text-red-400"
                  }`}>
                    {run.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
