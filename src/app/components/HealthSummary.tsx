export function HealthSummary() {
  const cronHealthy = 32;
  const cronTotal = 66;
  const cronErrors = 18;
  const cronIdle = 16;
  const healthPercentage = Math.round((cronHealthy / cronTotal) * 100);

  return (
    <div className="bg-zinc-800 border border-zinc-700 rounded-lg p-6">
      <h3 className="text-lg font-semibold text-zinc-100 mb-4">System Health</h3>
      
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <div className="w-2 h-2 rounded-full animate-pulse bg-green-500"></div>
            <span className="text-sm text-zinc-300">Gateway Status</span>
          </div>
          <span className="text-sm font-medium text-green-400">Online</span>
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <div className={`w-2 h-2 rounded-full animate-pulse ${healthPercentage >= 90 ? 'bg-green-500' : healthPercentage >= 80 ? 'bg-yellow-500' : 'bg-red-500'}`}></div>
            <span className="text-sm text-zinc-300">Cron Health</span>
          </div>
          <span className="text-sm font-medium text-zinc-300">
            {cronHealthy}/{cronTotal} ({healthPercentage}\u0025)
          </span>
        </div>

        <div className="w-full bg-zinc-700 rounded-full h-2">
          <div 
            className={`h-2 rounded-full ${healthPercentage >= 90 ? 'bg-green-500' : healthPercentage >= 80 ? 'bg-yellow-500' : 'bg-red-500'}`}
            style={{ width: `${healthPercentage}%` }}
          ></div>
        </div>

        <div className="grid grid-cols-3 gap-4 mt-4">
          <div className="text-center">
            <div className="text-lg font-semibold text-green-400">{cronHealthy}</div>
            <div className="text-xs text-zinc-400">Healthy</div>
          </div>
          <div className="text-center">
            <div className="text-lg font-semibold text-yellow-400">{cronIdle}</div>
            <div className="text-xs text-zinc-400">Idle</div>
          </div>
          <div className="text-center">
            <div className="text-lg font-semibold text-red-400">{cronErrors}</div>
            <div className="text-xs text-zinc-400">Error</div>
          </div>
        </div>
      </div>
    </div>
  );
}