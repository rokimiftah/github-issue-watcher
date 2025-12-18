import { v } from "convex/values";

import { mutation } from "./_generated/server";

export const requeueErrorTasks = mutation({
  args: { reportId: v.id("reports") },
  handler: async (ctx, args) => {
    const errorTasks = await ctx.db
      .query("analysis_tasks")
      .withIndex("report_status", (q) => q.eq("reportId", args.reportId).eq("status", "error"))
      .collect();

    console.log(`[REQUEUE] found ${errorTasks.length} error tasks to requeue`);

    for (const task of errorTasks) {
      await ctx.db.patch(task._id, {
        status: "queued",
        attempts: 0,
        error: undefined,
        updatedAt: Date.now(),
      });
      console.log(`[REQUEUE] requeued task for issue ${task.issue.id}`);
    }

    return { requeued: errorTasks.length };
  },
});
