// convex/rateLimiter.ts

import { v } from "convex/values";

import { internal } from "./_generated/api";
import { internalAction, internalMutation, mutation, query } from "./_generated/server";

export const LIMITS = {
  RPM: 700,
  RPH: Number.MAX_SAFE_INTEGER,
  TPM: Number.MAX_SAFE_INTEGER,
  TPH: Number.MAX_SAFE_INTEGER,
  ENABLE_TPD: false,
  TPD: Number.MAX_SAFE_INTEGER,
};

const KEEP_MINUTES = 5; // Keep buckets for 5 minutes after creation

function minuteBucket(ms: number) {
  return `m:${Math.floor(ms / 60_000)}`;
}

export const getQuota = query({
  args: { estimateTokens: v.number() },
  handler: async (ctx) => {
    const now = Date.now();
    const mb = minuteBucket(now);

    const m = await ctx.db
      .query("rate_limits")
      .withIndex("bucket", (q) => q.eq("bucket", mb))
      .first();

    const reqMin = m?.requests ?? 0;
    const allowReqByRPM = Math.max(0, LIMITS.RPM - reqMin);

    return {
      ok: allowReqByRPM > 0,
      maxRequests: allowReqByRPM,
      minuteRemainingTokens: Number.MAX_SAFE_INTEGER,
      hourRemainingTokens: Number.MAX_SAFE_INTEGER,
    };
  },
});

export const consume = mutation({
  args: { requests: v.number(), tokens: v.number() },
  handler: async (ctx, args) => {
    const now = Date.now();
    const mb = minuteBucket(now);

    const doc = await ctx.db
      .query("rate_limits")
      .withIndex("bucket", (q) => q.eq("bucket", mb))
      .first();
    if (!doc) {
      await ctx.db.insert("rate_limits", {
        bucket: mb,
        requests: args.requests,
        tokens: args.tokens,
        updatedAt: now,
      });
    } else {
      await ctx.db.patch(doc._id, {
        requests: Math.max(0, doc.requests + args.requests),
        tokens: Math.max(0, doc.tokens + args.tokens),
        updatedAt: now,
      });
    }
  },
});

export const clearAll = mutation({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("rate_limits").collect();
    for (const r of rows) await ctx.db.delete(r._id);
  },
});

export const vacuumOldBuckets = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const cutoffMinute = Math.floor(now / 60_000) - KEEP_MINUTES;

    const rows = await ctx.db.query("rate_limits").collect();
    for (const row of rows) {
      // Parse bucket from "m:{minute}" format
      const match = row.bucket.match(/^m:(\d+)$/);
      if (match) {
        const bucketMinute = parseInt(match[1], 10);
        if (bucketMinute < cutoffMinute) {
          await ctx.db.delete(row._id);
        }
      }
    }
  },
});

export const vacuumOldBucketsCron = internalAction({
  args: {},
  handler: async (ctx) => {
    await ctx.runMutation(internal.rateLimiter.vacuumOldBuckets, {});
  },
});
