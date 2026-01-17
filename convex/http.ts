/**
 * HTTP endpoints for external access (e.g., scraper ingestion).
 */

import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { api } from "./_generated/api";

const http = httpRouter();

/**
 * POST /ingest - Ingest scraper results
 * Body: { roasterId, roasterName, coffees: [...] }
 */
http.route({
  path: "/ingest",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const body = await request.json();

    const { roasterId, roasterName, coffees } = body;

    if (!roasterId || !roasterName || !Array.isArray(coffees)) {
      return new Response(
        JSON.stringify({ error: "Invalid request body" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    try {
      const result = await ctx.runMutation(api.coffees.batchUpsert, {
        roasterId,
        roasterName,
        coffees,
      });

      return new Response(
        JSON.stringify({ success: true, ...result }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    } catch (error) {
      return new Response(
        JSON.stringify({ error: String(error) }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }
  }),
});

/**
 * GET /active-urls - Get active URLs for a roaster
 * Query: ?roasterId=xxx
 */
http.route({
  path: "/active-urls",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const url = new URL(request.url);
    const roasterId = url.searchParams.get("roasterId");

    if (!roasterId) {
      return new Response(
        JSON.stringify({ error: "roasterId query param required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    try {
      const result = await ctx.runQuery(api.coffees.getActiveUrlsByRoaster, {
        roasterId,
      });

      return new Response(JSON.stringify(result), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    } catch (error) {
      return new Response(JSON.stringify({ error: String(error) }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
  }),
});

/**
 * POST /update-availability - Update availability for existing coffees
 * Body: { roasterId, updates: [{ url, prices, available }] }
 */
http.route({
  path: "/update-availability",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const body = await request.json();
    const { roasterId, updates } = body;

    if (!roasterId || !Array.isArray(updates)) {
      return new Response(
        JSON.stringify({ error: "Invalid request body" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    try {
      const result = await ctx.runMutation(api.coffees.updateAvailability, {
        roasterId,
        updates,
      });

      return new Response(JSON.stringify({ success: true, ...result }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    } catch (error) {
      return new Response(JSON.stringify({ error: String(error) }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
  }),
});

/**
 * POST /deactivate - Deactivate coffees by URL
 * Body: { roasterId, urls: string[] }
 */
http.route({
  path: "/deactivate",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const body = await request.json();
    const { roasterId, urls } = body;

    if (!roasterId || !Array.isArray(urls)) {
      return new Response(
        JSON.stringify({ error: "Invalid request body" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    try {
      const result = await ctx.runMutation(api.coffees.batchDeactivate, {
        roasterId,
        urls,
      });

      return new Response(JSON.stringify({ success: true, ...result }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    } catch (error) {
      return new Response(JSON.stringify({ error: String(error) }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
  }),
});

/**
 * POST /clear-all - Clear all coffees and roasters
 */
http.route({
  path: "/clear-all",
  method: "POST",
  handler: httpAction(async (ctx) => {
    try {
      const result = await ctx.runMutation(api.coffees.clearAll, {});

      return new Response(JSON.stringify({ success: true, ...result }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    } catch (error) {
      return new Response(JSON.stringify({ error: String(error) }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
  }),
});

export default http;
