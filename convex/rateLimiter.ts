// convex/rateLimiter.ts

import { v } from "convex/values";

import { mutation, query } from "./_generated/server";

export const LIMITS = {
  RPM: 30,
  RPH: Number.MAX_SAFE_INTEGER,
  TPM: Number.MAX_SAFE_INTEGER,
  TPH: Number.MAX_SAFE_INTEGER,
  ENABLE_TPD: false,
  TPD: Number.MAX_SAFE_INTEGER,
};

function minuteBucket(ms: number) {
  return `m:${Math.floor(ms / 60_000)}`;
}
function hourBucket(ms: number) {
  return `h:${Math.floor(ms / 3_600_000)}`;
}
function dayBucket(ms: number) {
  return `d:${Math.floor(ms / 86_400_000)}`;
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
