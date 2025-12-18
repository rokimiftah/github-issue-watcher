import type { Doc } from "./_generated/dataModel";

import { v } from "convex/values";

import { query } from "./_generated/server";

interface ReportIssue {
  id: string;
  number: number;
  title: string;
  body: string;
  labels: string[];
  createdAt: string;
  relevanceScore: number;
  explanation: string;
  matchedTerms?: string[];
  evidence?: string[];
}

export const debugReport = query({
  args: { reportId: v.id("reports") },
  handler: async (ctx, args) => {
    const report = (await ctx.db.get(args.reportId)) as Doc<"reports"> | null;
    if (!report) return null;

    const pendingIssues = report.issues.filter(
      (i: ReportIssue) => i.explanation === "" || (i.explanation.includes("Analysis") && !i.explanation.includes("No relevance")),
    );

    return {
      reportId: report._id,
      batchCursor: report.batchCursor,
      isComplete: report.isComplete,
      totalIssues: report.issues.length,
      pendingCount: pendingIssues.length,
      hasRelevantIssues: report.issues.some((i: ReportIssue) => i.relevanceScore > 50),
      pendingIssuesSample: pendingIssues.slice(0, 3),
    };
  },
});
