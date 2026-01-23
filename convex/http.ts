/**
 * HTTP endpoints for external access (e.g., scraper ingestion).
 */

import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { api, internal } from "./_generated/api";

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
 * GET /coffees - Get full coffee data for a roaster (for comparison)
 * Query: ?roasterId=xxx
 */
http.route({
  path: "/coffees",
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
      const coffees = await ctx.runQuery(api.coffees.getByRoaster, { roasterId });

      // Return only fields needed for comparison
      const result = coffees.map((c) => ({
        url: c.url,
        name: c.name,
        country: c.country,
        region: c.region,
        producer: c.producer,
        process: c.process,
        protocol: c.protocol,
        variety: c.variety,
        notes: c.notes,
        caffeine: c.caffeine,
        roastLevel: c.roastLevel ?? null,
        roastedFor: c.roastedFor ?? null,
      }));

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
 * POST /update-shipping - Update shipping rates for a roaster
 * Body: { roasterId, rates: [{ countryCode, available, price?, priceUsd?, currency, checkedAt }] }
 */
http.route({
  path: "/update-shipping",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const body = await request.json();
    const { roasterId, rates } = body;

    if (!roasterId || !Array.isArray(rates)) {
      return new Response(
        JSON.stringify({ error: "Invalid request body" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    try {
      const result = await ctx.runMutation(api.roasters.updateShippingRates, {
        roasterId,
        rates,
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
 * POST /clear-roaster - Delete all coffees for a roaster
 * Body: { roasterId: string }
 */
http.route({
  path: "/clear-roaster",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const body = await request.json();
    const { roasterId } = body;

    if (!roasterId) {
      return new Response(
        JSON.stringify({ error: "roasterId required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    try {
      const result = await ctx.runMutation(internal.coffees.clearRoaster, {
        roasterId,
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
 * POST /clear-inactive - Delete all inactive coffee records
 */
http.route({
  path: "/clear-inactive",
  method: "POST",
  handler: httpAction(async (ctx) => {
    try {
      const result = await ctx.runMutation(internal.coffees.clearAllInactive, {});

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
