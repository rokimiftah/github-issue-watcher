// convex/sendamatic/sendReportEmail.ts

import type { Doc } from "../_generated/dataModel";

import { ConvexError, v } from "convex/values";

import { api } from "../_generated/api";
import { action } from "../_generated/server";
import { renderIssueReportEmail } from "../../src/components/dashboard/template/IssueReportEmail";
import { createSendamaticClient } from "./SendamaticClient";

interface Issue {
  id: string;
  number: number;
  title: string;
  body: string;
  labels: string[];
  createdAt: string;
  relevanceScore: number;
  explanation: string;
}

export const sendReportEmail = action({
  args: { reportId: v.id("reports") },
  handler: async (ctx, args) => {
    const report = (await ctx.runQuery(api.githubIssues.getReport, {
      reportId: args.reportId,
    })) as Doc<"reports"> | null;
    if (!report) throw new ConvexError("Report not found");

    const relevantIssues = report.issues
      .filter((i: Issue) => i.relevanceScore > 50)
      .sort((a, b) => b.relevanceScore - a.relevanceScore);

    console.log("[EMAIL][prepare]", {
      reportId: String(args.reportId),
      isComplete: report.isComplete,
      cursor: report.batchCursor ?? null,
      relevant: relevantIssues.length,
      lastPartialCursor: report.lastPartialCursor ?? null,
      finalEmailAt: report.finalEmailAt ?? null,
    });

    // Atomic claim for final email to prevent duplicate sends
    if (report.isComplete) {
      const claim = await ctx.runMutation(api.githubIssues.claimFinalEmailSend, {
        reportId: args.reportId,
      });
      if (!claim.claimed) {
        console.log("[EMAIL] Final email already claimed by another process, skip.");
        return;
      }
    }

    if (!report.isComplete) {
      // If there's no batchCursor, this is a single-batch complete operation, no duplicate check needed
      // If there's a batchCursor, check if we already sent for this cursor
      // Note: Old data may have lastPartialCursor = "__NO_CURSOR__" from previous implementation.
      // This is handled correctly since the magic value won't match real cursors, and we skip
      // the check entirely when batchCursor is undefined (final batch).
      if (report.batchCursor) {
        if (report.lastPartialCursor === report.batchCursor) {
          console.log("[EMAIL] Partial already sent for this cursor, skip.");
          return;
        }
      }
    }

    if (relevantIssues.length === 0) {
      console.log("[EMAIL] No relevant issues to send.");
      if (!report.isComplete && report.batchCursor) {
        // Continue to next batch
        await ctx.scheduler.runAfter(0, api.githubIssues.processNextBatch, {
          reportId: args.reportId,
        });
      } else if (report.isComplete) {
        // Send final email indicating no relevant issues found
        const html = `
          <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
            <h2>GitHub Issues Report - No Relevant Issues Found</h2>
            <p>Repository: <a href="${report.repoUrl}">${report.repoUrl}</a></p>
            <p>Keyword: <strong>${report.keyword}</strong></p>
            <p>Total issues analyzed: ${report.issues.length}</p>
            <hr style="margin: 20px 0; border: none; border-top: 1px solid #eee;">
            <p>No issues with relevance score above 50 were found.</p>
            <p>You can modify the keyword or check the repository directly for more details.</p>
            <hr style="margin: 20px 0; border: none; border-top: 1px solid #eee;">
            <p style="color: #666; font-size: 12px;">This is an automated message from GitHub Issue Watcher.</p>
          </div>
        `;

        const sendamatic = createSendamaticClient();
        const result = await sendamatic.sendEmail({
          from: "GitHub Issue Watcher <notifications@giw.web.id>",
          to: report.userEmail,
          subject: `GIW - GitHub Issues Report for ${report.repoUrl} (Final)`,
          html,
        });

        if (!result.success) {
          throw new Error(`Sendamatic error: ${result.error}`);
        }
        console.log(`[EMAIL SENT] Final - no relevant issues for report ${args.reportId}`);
      }
      return;
    }

    const emailsSent = report.emailsSent ?? 0;
    const emailType = report.isComplete ? "Final" : "Partial";
    const batchNumber = report.isComplete && emailsSent === 0 ? "" : ` - ${emailsSent + 1}`;

    try {
      const html = await renderIssueReportEmail({
        repoUrl: report.repoUrl,
        keyword: report.keyword,
        userEmail: report.userEmail,
        issues: relevantIssues,
      });

      const sendamatic = createSendamaticClient();

      const result = await sendamatic.sendEmail({
        from: "GitHub Issue Watcher <notifications@giw.web.id>",
        to: report.userEmail,
        subject: `GIW - GitHub Issues Report for ${report.repoUrl} (${emailType}${batchNumber})`,
        html,
      });

      if (!result.success) {
        throw new Error(`Sendamatic error: ${result.error}`);
      }

      await ctx.runMutation(api.githubIssues.incrementEmailsSent, {
        reportId: args.reportId,
      });

      if (!report.isComplete) {
        // Only set lastPartialCursor if there's actually a batchCursor
        // For final batch (no cursor), this field stays null/undefined
        if (report.batchCursor) {
          await ctx.runMutation(api.githubIssues.setLastPartialCursor, {
            reportId: args.reportId,
            cursor: report.batchCursor,
          });
        }
      }

      console.log(`[EMAIL SENT] ${emailType}${batchNumber} - ${relevantIssues.length} issues for report ${args.reportId}`);

      if (!report.isComplete && report.batchCursor) {
        await ctx.scheduler.runAfter(0, api.githubIssues.processNextBatch, {
          reportId: args.reportId,
        });
      }
    } catch (error) {
      console.error("[sendReportEmail] Error:", error);
      throw new ConvexError(
        error instanceof Error
          ? error.message.includes("GitHub authentication failed")
            ? "Failed to send email due to invalid GITHUB_TOKEN."
            : `Failed to send email: ${error.message}`
          : "Unknown error sending email",
      );
    }
  },
});
