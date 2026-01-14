// convex/enqueue.ts

import { v } from "convex/values";

import { mutation } from "./_generated/server";

export const enqueueMissingTasks = mutation({
  args: { reportId: v.id("reports") },
  handler: async (ctx, args) => {
    const report = await ctx.db.get(args.reportId);
    if (!report) throw new Error("Report not found");

    const tasks = await ctx.db
      .query("analysis_tasks")
      .withIndex("report_status", (q) => q.eq("reportId", args.reportId))
      .collect();

    const existingIssueIds = new Set(tasks.map((t) => t.issue.id));
    const missingIssues = report.issues.filter((i) => !existingIssueIds.has(i.id));

    console.log(`[ENQUEUE] found ${missingIssues.length} missing issues to enqueue`);

    for (const issue of missingIssues) {
      await ctx.db.insert("analysis_tasks", {
        reportId: args.reportId,
        ownerUserId: report.userId,
        keyword: report.keyword,
        issue: {
          id: issue.id,
          number: issue.number,
          title: issue.title,
          body: issue.body,
          labels: issue.labels,
          createdAt: issue.createdAt,
        },
        estTokens: 1300,
        status: "queued",
        priority: 100,
        attempts: 0,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      console.log(`[ENQUEUE] task created for issue ${issue.id}`);
    }

    return { enqueued: missingIssues.length };
  },
});
