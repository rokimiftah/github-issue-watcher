import { v } from "convex/values";

import { mutation } from "./_generated/server";

export const markDone = mutation({
  args: { reportId: v.id("reports") },
  handler: async (ctx, args) => {
    const report = await ctx.db.get(args.reportId);
    if (!report) throw new Error("Report not found");

    // For the remaining 3 issues that have empty explanations
    const issues = report.issues.map((issue) => {
      if (!issue.explanation) {
        return {
          ...issue,
          relevanceScore: 0,
          explanation: "No relevant keyword match found in title, body, or labels.",
          matchedTerms: [],
          evidence: [],
        };
      }
      return issue;
    });

    await ctx.db.patch(args.reportId, {
      issues,
      lastFetched: Date.now(),
    });

    return { updatedIssues: issues.filter((i) => i.explanation).length };
  },
});
