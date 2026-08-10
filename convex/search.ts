import { query } from "./_generated/server";
import { v } from "convex/values";

export const globalSearch = query({
  args: { term: v.string() },
  handler: async (ctx, args) => {
    const term = args.term.toLowerCase();

    const [agents, cronJobs, projects, proposals, activity] = await Promise.all([
      ctx.db.query("agents").collect(),
      ctx.db.query("cron_jobs").collect(),
      ctx.db.query("projects").collect(),
      ctx.db.query("proposals").collect(),
      ctx.db.query("activity_events").order("desc").take(100),
    ]);

    return {
      agents: agents.filter(
        (a) => a.name.toLowerCase().includes(term) || a.host.toLowerCase().includes(term)
      ),
      cronJobs: cronJobs.filter((j) => j.name.toLowerCase().includes(term)),
      projects: projects.filter(
        (p) => p.name.toLowerCase().includes(term) || p.slug.toLowerCase().includes(term)
      ),
      proposals: proposals.filter(
        (p) =>
          p.brandName.toLowerCase().includes(term) || p.slug.toLowerCase().includes(term)
      ),
      activity: activity.filter(
        (e) =>
          e.title.toLowerCase().includes(term) ||
          e.description.toLowerCase().includes(term)
      ),
    };
  },
});
