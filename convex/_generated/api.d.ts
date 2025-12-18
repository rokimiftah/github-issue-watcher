/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as auth from "../auth.js";
import type * as crons from "../crons.js";
import type * as debug from "../debug.js";
import type * as enqueue from "../enqueue.js";
import type * as finalize from "../finalize.js";
import type * as githubActions from "../githubActions.js";
import type * as githubIssues from "../githubIssues.js";
import type * as helpers from "../helpers.js";
import type * as http from "../http.js";
import type * as llmAnalysis from "../llmAnalysis.js";
import type * as llmClient from "../llmClient.js";
import type * as llmWorker from "../llmWorker.js";
import type * as queue from "../queue.js";
import type * as rateLimiter from "../rateLimiter.js";
import type * as requeue from "../requeue.js";
import type * as sendamatic_SendamaticClient from "../sendamatic/SendamaticClient.js";
import type * as sendamatic_SendamaticOTP from "../sendamatic/SendamaticOTP.js";
import type * as sendamatic_SendamaticOTPPasswordReset from "../sendamatic/SendamaticOTPPasswordReset.js";
import type * as sendamatic_emailRenderer from "../sendamatic/emailRenderer.js";
import type * as sendamatic_sendReportEmail from "../sendamatic/sendReportEmail.js";
import type * as users from "../users.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  auth: typeof auth;
  crons: typeof crons;
  debug: typeof debug;
  enqueue: typeof enqueue;
  finalize: typeof finalize;
  githubActions: typeof githubActions;
  githubIssues: typeof githubIssues;
  helpers: typeof helpers;
  http: typeof http;
  llmAnalysis: typeof llmAnalysis;
  llmClient: typeof llmClient;
  llmWorker: typeof llmWorker;
  queue: typeof queue;
  rateLimiter: typeof rateLimiter;
  requeue: typeof requeue;
  "sendamatic/SendamaticClient": typeof sendamatic_SendamaticClient;
  "sendamatic/SendamaticOTP": typeof sendamatic_SendamaticOTP;
  "sendamatic/SendamaticOTPPasswordReset": typeof sendamatic_SendamaticOTPPasswordReset;
  "sendamatic/emailRenderer": typeof sendamatic_emailRenderer;
  "sendamatic/sendReportEmail": typeof sendamatic_sendReportEmail;
  users: typeof users;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
