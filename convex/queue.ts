// convex/queue.ts
/** biome-ignore-all lint/style/noNonNullAssertion: <> */

import { v } from "convex/values";

import { query } from "./_generated/server";

const PER_USER_MAX_RUNNING = 1_000_000_000; // effectively unlimited
const PER_USER_MAX_IN_BATCH = 1_000_000_000; // effectively unlimited

export const selectQueuedTasks = query({
  args: { limit: v.number() },
  handler: async (ctx, args) => {
    // Convex paginate has a hard upper limit; cap window to avoid errors
    const MAX_PAGE = 1000;
    const WINDOW = Math.min(MAX_PAGE, Math.max(args.limit * 2, 100));

    const { page: candidates } = await ctx.db
      .query("analysis_tasks")
      .withIndex("status_createdAt", (q) => q.eq("status", "queued"))
      .order("asc")
      .paginate({ numItems: WINDOW, cursor: null });

    const runningByUser = new Map<string, number>();
    const pickedByUser = new Map<string, number>();
    const selected: typeof candidates = [];

    for (const t of candidates) {
      const uid = String(t.ownerUserId);

      if (!runningByUser.has(uid)) {
        // Hitung "running" user ini (sekali saja per user)
        const rows = await ctx.db
          .query("analysis_tasks")
          .withIndex("owner_status", (q) => q.eq("ownerUserId", t.ownerUserId).eq("status", "running"))
          .collect();
        runningByUser.set(uid, rows.length);
        pickedByUser.set(uid, 0);
      }

      const running = runningByUser.get(uid)!;
      const picked = pickedByUser.get(uid)!;

      // Hormati batas global & jatah per seleksi
      if (running + picked >= PER_USER_MAX_RUNNING) continue;
      if (picked >= PER_USER_MAX_IN_BATCH) continue;

      selected.push(t);
      pickedByUser.set(uid, picked + 1);

      if (selected.length >= args.limit) break;
    }

    return selected;
  },
});
