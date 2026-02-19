import { AgentCard } from "./components/AgentCard";
import { HealthSummary } from "./components/HealthSummary";
import { PipelineStats } from "./components/PipelineStats";
import { RecentCronActivity } from "./components/RecentCronActivity";

export default function HomePage() {
  return (
    <div className="space-y-6">
      {/* Agent Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <AgentCard
          name="Ari"
          icon="🧠"
          model="Opus 4.6"
          role="main ops"
          status="healthy"
          uptime="99.2\u0025"
          lastActivity="2 mins ago"
        />
        <AgentCard
          name="Arlo"
          icon="📊"
          model="Sonnet 4"
          role="sales"
          status="healthy"
          uptime="98.7\u0025"
          lastActivity="5 mins ago"
        />
        <AgentCard
          name="Axel"
          icon="⚡"
          model="Sonnet 4"
          role="dev"
          status="healthy"
          uptime="97.8\u0025"
          lastActivity="8 mins ago"
        />
      </div>

      {/* Health Summary & Pipeline Stats */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <HealthSummary />
        <PipelineStats />
      </div>

      {/* Recent Cron Activity */}
      <RecentCronActivity />
    </div>
  );
}