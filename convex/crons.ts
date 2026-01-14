// convex/crons.ts

import { cronJobs } from "convex/server";

import { internal } from "./_generated/api";

const crons = cronJobs();

crons.interval("vacuum analysis tasks", { hours: 12 }, internal.llmWorker.vacuumTasksCron);
crons.interval("vacuum rate limit buckets", { minutes: 10 }, internal.rateLimiter.vacuumOldBucketsCron);

// crons.daily(
// 	"clean expired cache",
// 	{ hourUTC: 0, minuteUTC: 0 },
// 	internal.llmAnalysis.cleanExpiredCache,
// );

export default crons;
