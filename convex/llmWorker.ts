// convex/llmWorker.ts
/** biome-ignore-all lint/style/noNonNullAssertion: <> */
/** biome-ignore-all lint/suspicious/noExplicitAny: <> */

import type { Id } from "./_generated/dataModel";

import { ConvexError, v } from "convex/values";

import { api, internal } from "./_generated/api";
import { action, internalAction, internalMutation, mutation, query } from "./_generated/server";
import { analyzeIssueOpenAIStyle } from "./llmClient";

const MAX_CONCURRENT = 3; // keep low to avoid provider burst 429
const ESTIMATE_TOKENS_DEFAULT = 1300;
const MAX_TOKENS = 800;

/* ===================== Locks ===================== */
export const acquireLock = mutation({
  args: { name: v.string(), ttlMs: v.number() },
  handler: async (ctx, args) => {
    const now = Date.now();
    const lock = await ctx.db
      .query("locks")
      .withIndex("name", (q) => q.eq("name", args.name))
      .first();
    if (!lock) {
      await ctx.db.insert("locks", {
        name: args.name,
        leaseExpiresAt: now + args.ttlMs,
        owner: "llmWorker",
      });
      return true;
    }
    if (lock.leaseExpiresAt < now) {
      await ctx.db.patch(lock._id, {
        leaseExpiresAt: now + args.ttlMs,
        owner: "llmWorker",
      });
      return true;
    }
    return false;
  },
});

export const releaseLock = mutation({
  args: { name: v.string() },
  handler: async (ctx, args) => {
    const lock = await ctx.db
      .query("locks")
      .withIndex("name", (q) => q.eq("name", args.name))
      .first();
    if (lock)
      await ctx.db.patch(lock._id, {
        leaseExpiresAt: 0,
        owner: undefined,
      });
  },
});

/* =============== Task queue ops =============== */
export const enqueueAnalysisTasks = mutation({
  args: {
    reportId: v.id("reports"),
    ownerUserId: v.id("users"),
    keyword: v.string(),
    issues: v.array(
      v.object({
        id: v.string(),
        number: v.number(),
        title: v.string(),
        body: v.string(),
        labels: v.array(v.string()),
        createdAt: v.string(),
      }),
    ),
    priority: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const prio = args.priority ?? 100;
    let inserted = 0;
    for (const issue of args.issues) {
      await ctx.db.insert("analysis_tasks", {
        reportId: args.reportId,
        ownerUserId: args.ownerUserId,
        keyword: args.keyword,
        issue,
        estTokens: ESTIMATE_TOKENS_DEFAULT,
        status: "queued",
        priority: prio,
        attempts: 0,
        createdAt: now,
        updatedAt: now,
      });
      inserted++;
    }
    console.log("[GIW][enqueue] report:", String(args.reportId), "inserted:", inserted);
  },
});

export const _listQueued = query({
  args: { window: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const WINDOW = args.window ?? 500; // kandidat maks.
    const rows = await ctx.db
      .query("analysis_tasks")
      .withIndex("status_createdAt", (q) => q.eq("status", "queued"))
      .order("asc") // paling tua dulu
      .collect();

    return rows.slice(0, WINDOW);
  },
});

export const _listRunning = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("analysis_tasks")
      .withIndex("status_priority", (q) => q.eq("status", "running"))
      .collect();
  },
});

export const markTasksRunning = mutation({
  args: { ids: v.array(v.id("analysis_tasks")) },
  handler: async (ctx, args) => {
    const now = Date.now();
    for (const id of args.ids) {
      await ctx.db.patch(id, { status: "running", updatedAt: now });
    }
  },
});

export const markTaskDone = mutation({
  args: { id: v.id("analysis_tasks") },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, {
      status: "done",
      updatedAt: Date.now(),
      error: undefined,
    });
  },
});

export const markTaskRequeueOrError = mutation({
  args: {
    id: v.id("analysis_tasks"),
    attempts: v.number(),
    error: v.string(),
  },
  handler: async (ctx, args) => {
    const status = args.attempts >= 3 ? "error" : "queued";
    await ctx.db.patch(args.id, {
      status,
      attempts: args.attempts,
      updatedAt: Date.now(),
      error: args.error,
    });
  },
});

export const markTasksCanceled = mutation({
  args: { ids: v.array(v.id("analysis_tasks")) },
  handler: async (ctx, args) => {
    const now = Date.now();
    for (const id of args.ids) {
      await ctx.db.patch(id, { status: "canceled", updatedAt: now });
    }
  },
});

/* =============== Update result ke report =============== */
export const updateIssueResult = mutation({
  args: {
    reportId: v.id("reports"),
    issueId: v.string(),
    relevanceScore: v.number(),
    explanation: v.string(),
    matchedTerms: v.optional(v.array(v.string())),
    evidence: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const report = await ctx.db.get(args.reportId);
    if (!report) throw new ConvexError("Report not found");
    const issues = report.issues.map((it: any) =>
      it.id === args.issueId
        ? {
            ...it,
            relevanceScore: args.relevanceScore,
            explanation: args.explanation,
            matchedTerms: args.matchedTerms ?? [],
            evidence: args.evidence ?? [],
          }
        : it,
    );
    await ctx.db.patch(args.reportId, { issues, lastFetched: Date.now() });
  },
});

export const updateIssuesBatch = mutation({
  args: {
    reportId: v.id("reports"),
    updates: v.array(
      v.object({
        issueId: v.string(),
        relevanceScore: v.number(),
        explanation: v.string(),
        matchedTerms: v.optional(v.array(v.string())),
        evidence: v.optional(v.array(v.string())),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const report = await ctx.db.get(args.reportId);
    if (!report) throw new ConvexError("Report not found");
    const map = new Map(args.updates.map((u) => [u.issueId, u] as const));
    const issues = report.issues.map((it: any) => {
      const u = map.get(it.id);
      if (!u) return it;
      return {
        ...it,
        relevanceScore: u.relevanceScore,
        explanation: u.explanation,
        matchedTerms: u.matchedTerms ?? [],
        evidence: u.evidence ?? [],
      };
    });
    await ctx.db.patch(args.reportId, {
      issues,
      lastFetched: Date.now(),
    });
  },
});

/* =============== Util untuk cek status batch =============== */
function pendingCount(report: any) {
  return report.issues.filter(
    (i: any) => i.explanation === "" || (i.explanation.includes("Analysis") && !i.explanation.includes("No relevance")),
  ).length;
}

/* =============== Rescue: cari report yang siap next batch saat antrian kosong =============== */
export const getReportsReadyForNextBatch = query({
  args: { limit: v.number() },
  handler: async (ctx, args) => {
    // Handle incomplete reports with queued/fetched issues
    const incompleteReports = await ctx.db
      .query("reports")
      .filter((q) => q.eq(q.field("isComplete"), false))
      .collect();

    const fromIncomplete = incompleteReports
      .filter((r: any) => !!r.batchCursor && pendingCount(r) === 0)
      .sort((a: any, b: any) => a.createdAt - b.createdAt);

    // Handle complete reports that haven't sent final email
    const completeReports = await ctx.db
      .query("reports")
      .filter((q) => q.and(q.eq(q.field("isComplete"), true), q.eq(q.field("isCanceled"), undefined)))
      .collect();

    const fromComplete = completeReports.filter((r: any) => !r.finalEmailAt).sort((a: any, b: any) => a.createdAt - b.createdAt);

    const ready = [...fromIncomplete, ...fromComplete].slice(0, args.limit);

    console.log("[GIW][readyNextBatch] found:", ready.length, {
      fromIncomplete: fromIncomplete.length,
      fromComplete: fromComplete.length,
    });
    return ready.map((r: any) => r._id);
  },
});

export const countActiveTasksForReport = query({
  args: { reportId: v.id("reports") },
  handler: async (ctx, args) => {
    const hasQueued = !!(await ctx.db
      .query("analysis_tasks")
      .withIndex("report_status", (q) => q.eq("reportId", args.reportId).eq("status", "queued"))
      .first());

    const hasRunning = !!(await ctx.db
      .query("analysis_tasks")
      .withIndex("report_status", (q) => q.eq("reportId", args.reportId).eq("status", "running"))
      .first());

    const queued = hasQueued ? 1 : 0;
    const running = hasRunning ? 1 : 0;
    const total = queued + running;

    return { queued, running, total };
  },
});

async function withTimeout<T>(p: Promise<T>, ms: number, label = "op"): Promise<T> {
  let t: any;
  try {
    return await Promise.race([
      p,
      new Promise<T>((_, rej) => {
        t = setTimeout(() => rej(new Error(`${label} timeout after ${ms}ms`)), ms);
      }),
    ]);
  } finally {
    clearTimeout(t);
  }
}

export const tick = action({
  args: {},
  handler: async (ctx) => {
    const TICK_BUDGET_MS = 86_400_000; // long budget to avoid reschedule delays
    const LLM_TIMEOUT_MS = 120_000; // timeout tiap panggilan LLM
    const lockTtl = TICK_BUDGET_MS + 5_000; // TTL lock > budget
    const tickStart = Date.now();

    console.log("[GIW][tick] try acquire lock");
    const got = await ctx.runMutation(api.llmWorker.acquireLock, {
      name: "llm_worker",
      ttlMs: lockTtl,
    });
    console.log("[GIW][tick] acquire result:", got);
    if (!got) return;

    try {
      const quota = await ctx.runQuery(api.rateLimiter.getQuota, {
        estimateTokens: ESTIMATE_TOKENS_DEFAULT,
      });
      console.log("[GIW][tick] quota", quota);
      if (!quota.ok) {
        console.log("[GIW][tick] quota blocked → sleep");
        await ctx.scheduler.runAfter(2000, api.llmWorker.tick, {});
        return;
      }

      const BATCH = Math.max(1, Math.min(quota.maxRequests, MAX_CONCURRENT));
      const queued = await ctx.runQuery(api.queue.selectQueuedTasks, {
        limit: BATCH,
      });
      console.log("[GIW][tick] queued selected", {
        requested: BATCH,
        got: queued.length,
      });

      // Filter out tasks for reports that are canceled; cancel their queued tasks
      const uniqueReports = Array.from(new Set(queued.map((t) => String(t.reportId))));
      const canceledReports = new Set<string>();
      for (const ridStr of uniqueReports) {
        const rep = await ctx.runQuery(api.githubIssues.getReport, {
          reportId: ridStr as unknown as Id<"reports">,
        });
        if (rep?.isCanceled) {
          canceledReports.add(ridStr);
          await ctx.runMutation(api.llmWorker.cancelQueuedTasksForReport, {
            reportId: ridStr as unknown as Id<"reports">,
          });
        }
      }
      const work = queued.filter((t) => !canceledReports.has(String(t.reportId)));

      if (work.length === 0) {
        const ready = await ctx.runQuery(api.llmWorker.getReportsReadyForNextBatch, { limit: 3 });
        if (ready.length > 0) {
          console.log("[GIW][tick] rescue → trigger actions for", ready.length, "report(s)");
          for (const reportId of ready) {
            const report = await ctx.runQuery(api.githubIssues.getReport, { reportId: reportId as unknown as Id<"reports"> });

            if (report?.isComplete && !report.finalEmailAt) {
              console.log("[GIW][tick] rescue → send final email for", String(reportId));
              await ctx.scheduler.runAfter(0, api.sendamatic.sendReportEmail.sendReportEmail, { reportId });
            } else if (report?.batchCursor && pendingCount(report) === 0) {
              console.log("[GIW][tick] rescue → processNextBatch for", String(reportId));
              await ctx.scheduler.runAfter(0, api.githubIssues.processNextBatch, { reportId });
            }
          }
          await ctx.scheduler.runAfter(0, api.llmWorker.tick, {});
          return;
        }
        console.log("[GIW][tick] idle: no queued tasks and no ready reports → exit (no reschedule)");
        return; // don't reschedule when system is idle
      }

      // === PROSES PER-CHUNK ===
      for (let i = 0; i < work.length; i += MAX_CONCURRENT) {
        // budget guard: jangan biarkan tick melewati budget
        if (Date.now() - tickStart > TICK_BUDGET_MS) {
          console.log("[GIW][tick] budget reached → reschedule");
          await ctx.scheduler.runAfter(500, api.llmWorker.tick, {});
          return;
        }

        const chunk = work.slice(i, i + MAX_CONCURRENT);

        // Mark RUNNING & consume quota for this chunk
        await ctx.runMutation(api.llmWorker.markTasksRunning, {
          ids: chunk.map((t) => t._id),
        });
        await ctx.runMutation(api.rateLimiter.consume, {
          requests: chunk.length,
          tokens: chunk.length * ESTIMATE_TOKENS_DEFAULT,
        });

        // Jalankan paralel terbatas + timeout per panggilan LLM
        type Success = {
          task: (typeof chunk)[number];
          res: {
            relevanceScore: number;
            explanation: string;
            matchedTerms?: string[];
            evidence?: string[];
          };
        };
        const successes: Success[] = [];
        await Promise.all(
          chunk.map(async (task) => {
            try {
              // Fast-cancel: skip analysis if report has been stopped
              const rep = await ctx.runQuery(api.githubIssues.getReport, { reportId: task.reportId as Id<"reports"> });
              if (rep?.isCanceled) {
                await ctx.runMutation(api.llmWorker.markTasksCanceled, { ids: [task._id] });
                return;
              }

              const res = await withTimeout(
                analyzeIssueOpenAIStyle({
                  keyword: task.keyword,
                  issue: task.issue,
                  maxTokens: MAX_TOKENS,
                }),
                LLM_TIMEOUT_MS,
                `analyze #${task.issue.number}`,
              );
              successes.push({ task, res });
            } catch (err: any) {
              const attempts = (task.attempts ?? 0) + 1;
              await ctx.runMutation(api.llmWorker.markTaskRequeueOrError, {
                id: task._id,
                attempts,
                error: String(err?.message ?? err),
              });
            }
          }),
        );

        // Group successful results by reportId and write per-report to avoid conflicts
        const byReport = new Map<string, Success[]>();
        for (const s of successes) {
          const key = String(s.task.reportId);
          if (!byReport.has(key)) byReport.set(key, []);
          byReport.get(key)!.push(s);
        }

        for (const [ridStr, items] of byReport.entries()) {
          // Skip commit if report is canceled during processing
          const rep = await ctx.runQuery(api.githubIssues.getReport, {
            reportId: ridStr as unknown as Id<"reports">,
          });
          if (rep?.isCanceled) {
            await ctx.runMutation(api.llmWorker.markTasksCanceled, {
              ids: items.map((s) => s.task._id),
            });
            continue;
          }
          const updates = items.map((s) => ({
            issueId: s.task.issue.id,
            relevanceScore: s.res.relevanceScore,
            explanation: s.res.explanation,
            matchedTerms: s.res.matchedTerms ?? [],
            evidence: s.res.evidence ?? [],
          }));

          // Retry a few times to handle rare conflicts
          let ok = false;
          let attempts = 0;
          while (!ok && attempts < 3) {
            attempts++;
            try {
              await ctx.runMutation(api.llmWorker.updateIssuesBatch, {
                reportId: ridStr as unknown as Id<"reports">,
                updates,
              });
              ok = true;
            } catch (e) {
              if (attempts >= 3) throw e;
            }
          }

          // Mark all tasks for this report as done
          for (const s of items) {
            await ctx.runMutation(api.llmWorker.markTaskDone, {
              id: s.task._id,
            });
          }
        }
      }

      // === Post-batch bookkeeping (tetap sama) ===
      const touchedReportIds = Array.from(new Set(work.map((t) => String(t.reportId))));
      for (const ridStr of touchedReportIds) {
        const rid = ridStr as unknown as Id<"reports">;
        const report = await ctx.runQuery(api.githubIssues.getReport, {
          reportId: rid,
        });
        if (!report) continue;

        const remaining = report.issues.filter(
          (i: any) => i.relevanceScore === 0 && (i.explanation === "" || i.explanation.includes("Analysis")),
        ).length;

        const { total: activeTasks } = await ctx.runQuery(api.llmWorker.countActiveTasksForReport, {
          reportId: rid,
        });

        console.log("[GIW][tick] post-batch state", {
          reportId: String(rid),
          remaining,
          activeTasks,
          cursor: report.batchCursor ?? null,
          isComplete: report.isComplete,
        });

        if (remaining === 0 && !report.batchCursor && activeTasks === 0 && !report.isComplete && !report.isCanceled) {
          console.log("[GIW][tick] finalize report:", String(rid));
          await ctx.runMutation(api.githubIssues.updateReport, {
            reportId: rid,
            issues: report.issues,
            batchCursor: undefined,
            isComplete: true,
          });
          await ctx.scheduler.runAfter(0, api.sendamatic.sendReportEmail.sendReportEmail, { reportId: rid });
          continue;
        }

        if (remaining === 0 && report.batchCursor && activeTasks === 0 && !report.isCanceled) {
          console.log("[GIW][tick] partial email + next batch for:", String(rid));
          await ctx.scheduler.runAfter(0, api.sendamatic.sendReportEmail.sendReportEmail, { reportId: rid });
          await ctx.scheduler.runAfter(0, api.githubIssues.processNextBatch, { reportId: rid });
        }
      }

      await ctx.scheduler.runAfter(1000, api.llmWorker.tick, {});
      console.log("[GIW][tick] reschedule next tick");
    } finally {
      await ctx.runMutation(api.llmWorker.releaseLock, {
        name: "llm_worker",
      });
      console.log("[GIW][tick] lock released");
    }
  },
});

export const cancelQueuedTasksForReport = mutation({
  args: { reportId: v.id("reports") },
  handler: async (ctx, args) => {
    const toCancel = await ctx.db
      .query("analysis_tasks")
      .withIndex("report_status", (q) => q.eq("reportId", args.reportId).eq("status", "queued"))
      .collect();
    for (const t of toCancel) {
      await ctx.db.patch(t._id, {
        status: "canceled",
        updatedAt: Date.now(),
      });
    }
    console.log("[GIW][cancelTasks] canceled:", toCancel.length, "for report", String(args.reportId));
  },
});

export const deleteTasksForReport = mutation({
  args: { reportId: v.id("reports") },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("analysis_tasks")
      .withIndex("report_status", (q) => q.eq("reportId", args.reportId))
      .collect();
    for (const r of rows) await ctx.db.delete(r._id);
    console.log("[GIW][deleteTasksForReport] deleted:", rows.length, "for", String(args.reportId));
  },
});

export const clearLocks = mutation({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("locks").collect();
    for (const r of rows) await ctx.db.delete(r._id);
    console.log("[GIW][clearLocks] cleared:", rows.length);
  },
});

export const vacuumTasks = internalMutation({
  args: { keepHours: v.number() },
  handler: async (ctx, args) => {
    const cutoff = Date.now() - args.keepHours * 3600_000;

    const done = await ctx.db
      .query("analysis_tasks")
      .withIndex("status_priority", (q) => q.eq("status", "done"))
      .collect();
    const err = await ctx.db
      .query("analysis_tasks")
      .withIndex("status_priority", (q) => q.eq("status", "error"))
      .collect();
    const canceled = await ctx.db
      .query("analysis_tasks")
      .withIndex("status_priority", (q) => q.eq("status", "canceled"))
      .collect();

    for (const t of [...done, ...err, ...canceled]) {
      if (t.updatedAt < cutoff) await ctx.db.delete(t._id);
    }
  },
});

export const vacuumTasksCron = internalAction({
  args: {},
  handler: async (ctx) => {
    const KEEP_HOURS = 72; // atur sesuai kebutuhan
    await ctx.runMutation(internal.llmWorker.vacuumTasks, {
      keepHours: KEEP_HOURS,
    });
  },
});
