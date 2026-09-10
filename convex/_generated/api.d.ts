/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as activity from "../activity.js";
import type * as calendarEvents from "../calendarEvents.js";
import type * as collectors from "../collectors.js";
import type * as dashboard from "../dashboard.js";
import type * as http from "../http.js";
import type * as memoryDocs from "../memoryDocs.js";
import type * as mondayRevenue from "../mondayRevenue.js";
import type * as needsApple from "../needsApple.js";
import type * as pipelineStats from "../pipelineStats.js";
import type * as projects from "../projects.js";
import type * as proposals from "../proposals.js";
import type * as revenue from "../revenue.js";
import type * as search from "../search.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  activity: typeof activity;
  calendarEvents: typeof calendarEvents;
  collectors: typeof collectors;
  dashboard: typeof dashboard;
  http: typeof http;
  memoryDocs: typeof memoryDocs;
  mondayRevenue: typeof mondayRevenue;
  needsApple: typeof needsApple;
  pipelineStats: typeof pipelineStats;
  projects: typeof projects;
  proposals: typeof proposals;
  revenue: typeof revenue;
  search: typeof search;
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
