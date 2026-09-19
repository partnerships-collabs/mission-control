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
import type * as allTimeRevenueMath from "../allTimeRevenueMath.js";
import type * as calendarEvents from "../calendarEvents.js";
import type * as closeRevenue from "../closeRevenue.js";
import type * as collectors from "../collectors.js";
import type * as crons from "../crons.js";
import type * as dashboard from "../dashboard.js";
import type * as http from "../http.js";
import type * as httpSecurity from "../httpSecurity.js";
import type * as memoryDocs from "../memoryDocs.js";
import type * as mondayRevenue from "../mondayRevenue.js";
import type * as mondayRevenueMath from "../mondayRevenueMath.js";
import type * as monthlyRevenueMath from "../monthlyRevenueMath.js";
import type * as monthlyRevenueValidator from "../monthlyRevenueValidator.js";
import type * as needsApple from "../needsApple.js";
import type * as pipelineStats from "../pipelineStats.js";
import type * as projects from "../projects.js";
import type * as proposals from "../proposals.js";
import type * as realtimeRevenue from "../realtimeRevenue.js";
import type * as realtimeRevenueModel from "../realtimeRevenueModel.js";
import type * as reconcileMonday from "../reconcileMonday.js";
import type * as revenue from "../revenue.js";
import type * as revenueEvidence from "../revenueEvidence.js";
import type * as revenueMath from "../revenueMath.js";
import type * as search from "../search.js";
import type * as unifiedRevenue from "../unifiedRevenue.js";
import type * as unifiedRevenueMath from "../unifiedRevenueMath.js";
import type * as unifiedRevenueModel from "../unifiedRevenueModel.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  activity: typeof activity;
  allTimeRevenueMath: typeof allTimeRevenueMath;
  calendarEvents: typeof calendarEvents;
  closeRevenue: typeof closeRevenue;
  collectors: typeof collectors;
  crons: typeof crons;
  dashboard: typeof dashboard;
  http: typeof http;
  httpSecurity: typeof httpSecurity;
  memoryDocs: typeof memoryDocs;
  mondayRevenue: typeof mondayRevenue;
  mondayRevenueMath: typeof mondayRevenueMath;
  monthlyRevenueMath: typeof monthlyRevenueMath;
  monthlyRevenueValidator: typeof monthlyRevenueValidator;
  needsApple: typeof needsApple;
  pipelineStats: typeof pipelineStats;
  projects: typeof projects;
  proposals: typeof proposals;
  realtimeRevenue: typeof realtimeRevenue;
  realtimeRevenueModel: typeof realtimeRevenueModel;
  reconcileMonday: typeof reconcileMonday;
  revenue: typeof revenue;
  revenueEvidence: typeof revenueEvidence;
  revenueMath: typeof revenueMath;
  search: typeof search;
  unifiedRevenue: typeof unifiedRevenue;
  unifiedRevenueMath: typeof unifiedRevenueMath;
  unifiedRevenueModel: typeof unifiedRevenueModel;
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
