/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as coffees from "../coffees.js";
import type * as http from "../http.js";
import type * as noteEmbeddings from "../noteEmbeddings.js";
import type * as roasters from "../roasters.js";
import type * as search from "../search.js";
import type * as taxonomy from "../taxonomy.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  coffees: typeof coffees;
  http: typeof http;
  noteEmbeddings: typeof noteEmbeddings;
  roasters: typeof roasters;
  search: typeof search;
  taxonomy: typeof taxonomy;
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
