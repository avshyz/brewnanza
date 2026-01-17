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

export default http;
