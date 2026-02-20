export function RecentCronActivity() {
  const recentRuns = [
    { name: "fathom-pipeline-checker", agent: "arlo", ranAt: "8m ago", duration: "11.2s", status: "ok" },
    { name: "fathom-proposal-writer", agent: "arlo", ranAt: "23m ago", duration: "6.5s", status: "ok" },
    { name: "needs-apple-sync", agent: "main", ranAt: "26m ago", duration: "7.4s", status: "ok" },
    { name: "cron-error-alert", agent: "main", ranAt: "26m ago", duration: "16.0s", status: "ok" },
    { name: "inbound-email-monitor", agent: "main", ranAt: "27m ago", duration: "42.7s", status: "ok" },
    { name: "ari-heartbeat", agent: "main", ranAt: "27m ago", duration: "35.8s", status: "ok" },
    { name: "axel-heartbeat", agent: "axel", ranAt: "37m ago", duration: "18.0m", status: "error" },
    { name: "arlo-heartbeat", agent: "arlo", ranAt: "38m ago", duration: "17.1s", status: "ok" },
    { name: "axel-github-watch", agent: "axel", ranAt: "38m ago", duration: "9.3s", status: "ok" },
    { name: "axel-build-health", agent: "axel", ranAt: "38m ago", duration: "5.4s", status: "ok" },
  ];

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
