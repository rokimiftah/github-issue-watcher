// convex/crons.ts

import { cronJobs } from "convex/server";

import { api, internal } from "./_generated/api";

const crons = cronJobs();

crons.interval("vacuum analysis tasks", { hours: 12 }, internal.llmWorker.vacuumTasksCron);
crons.interval("vacuum rate limit buckets", { minutes: 10 }, internal.rateLimiter.vacuumOldBucketsCron);

// Refresh iFlow API key daily at 01:00 UTC (08:00 UTC+7)
crons.daily("refresh iFlow API key", { hourUTC: 1, minuteUTC: 0 }, api.iflow.refreshApiKey);

// crons.daily(
// 	"clean expired cache",
// 	{ hourUTC: 0, minuteUTC: 0 },
// 	internal.llmAnalysis.cleanExpiredCache,
// );

export default crons;
