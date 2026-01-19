#!/usr/bin/env python3
"""
Embed coffees for semantic search.
Fetches coffees missing embeddings from Convex, generates embeddings with e5-large-v2,
and pushes them back to Convex.

Usage:
    bun run embed           # Embed all missing coffees
    bun run embed --dry-run # Preview without pushing
"""

import argparse
import os
import sys
from typing import Any

from convex import ConvexClient
from dotenv import load_dotenv
from sentence_transformers import SentenceTransformer

# Load .env from project root (try multiple locations)
script_dir = os.path.dirname(__file__)
load_dotenv(os.path.join(script_dir, "../../.env.local"))
load_dotenv(os.path.join(script_dir, ".env.local"))

CONVEX_URL = os.getenv("CONVEX_URL") or os.getenv("NEXT_PUBLIC_CONVEX_URL")
if not CONVEX_URL:
    print("Error: CONVEX_URL or NEXT_PUBLIC_CONVEX_URL not set")
    sys.exit(1)

# Batch size for embedding and pushing
BATCH_SIZE = 50


def build_text_blob(coffee: dict[str, Any]) -> str:
    """
    Build text blob for embedding.
    Notes + process first for slight weighting priority. No field prefixes.
    """
    parts = []

    # Notes first (most important for semantic similarity)
    if coffee.get("notes"):
        parts.append(". ".join(coffee["notes"]))

    # Process and protocol
    if coffee.get("process"):
        parts.append(". ".join(coffee["process"]))
    if coffee.get("protocol"):
        parts.append(". ".join(coffee["protocol"]))

    # Roast info
    if coffee.get("roastLevel"):
        parts.append(coffee["roastLevel"])
    if coffee.get("roastedFor"):
        parts.append(coffee["roastedFor"])

    # Origin
    if coffee.get("country"):
        parts.append(". ".join(coffee["country"]))
    if coffee.get("region"):
        parts.append(". ".join(coffee["region"]))

    # Variety
    if coffee.get("variety"):
        parts.append(". ".join(coffee["variety"]))

    return ". ".join(parts)


def main():
    parser = argparse.ArgumentParser(description="Embed coffees for semantic search")
    parser.add_argument("--dry-run", action="store_true", help="Preview without pushing")
    parser.add_argument("--limit", type=int, default=500, help="Max coffees to process")
    parser.add_argument("-v", "--verbose", action="store_true", help="Verbose output")
    args = parser.parse_args()

    print("Loading e5-large-v2 model...")
    model = SentenceTransformer("intfloat/e5-large-v2")

    print("Connecting to Convex...")
    client = ConvexClient(CONVEX_URL)

    print(f"Fetching coffees missing embeddings (limit: {args.limit})...")
    coffees = client.query("coffees:getMissingEmbeddings", {"limit": args.limit})
    print(f"Found {len(coffees)} coffees to embed")

    if not coffees:
        print("No coffees need embedding!")
        return

    # Process in batches
    total_embedded = 0
    for i in range(0, len(coffees), BATCH_SIZE):
        batch = coffees[i : i + BATCH_SIZE]
        print(f"\nProcessing batch {i // BATCH_SIZE + 1} ({len(batch)} coffees)...")

        # Build text blobs
        texts = []
        for coffee in batch:
            text = build_text_blob(coffee)
            texts.append(f"passage: {text}")  # e5 requires "passage:" prefix for docs
            if args.verbose:
                print(f"  {coffee['name']}: {text[:80]}...")

        # Generate embeddings
        print("  Generating embeddings...")
        embeddings = model.encode(texts, normalize_embeddings=True)

        if args.dry_run:
            print(f"  [DRY RUN] Would update {len(batch)} coffees")
            total_embedded += len(batch)
            continue

        # Push to Convex
        print("  Pushing to Convex...")
        updates = [
            {"id": coffee["_id"], "embedding": embedding.tolist()}
            for coffee, embedding in zip(batch, embeddings)
        ]
        result = client.mutation("coffees:updateEmbeddings", {"updates": updates})
        total_embedded += result.get("updated", 0)
        print(f"  Updated {result.get('updated', 0)} coffees")

    print(f"\n{'[DRY RUN] Would have embedded' if args.dry_run else 'Embedded'} {total_embedded} coffees")


if __name__ == "__main__":
    main()
