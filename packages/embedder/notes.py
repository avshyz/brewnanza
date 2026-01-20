#!/usr/bin/env python3
"""
Embed individual tasting notes for semantic search.
Fetches distinct notes from Convex, generates embeddings with e5-large-v2 or OpenAI API,
and pushes them back to Convex.

Usage:
    python notes.py              # Embed all missing notes (e5)
    python notes.py --dry-run    # Preview without pushing
    python notes.py --all        # Re-embed all notes (even existing)
    python notes.py --openai     # Use OpenAI API (text-embedding-3-small, 1024 dims)
"""

import argparse
import os
import sys

import requests
from convex import ConvexClient
from dotenv import load_dotenv

# Load .env from project root (try multiple locations)
script_dir = os.path.dirname(__file__)
load_dotenv(os.path.join(script_dir, "../../.env.local"))
load_dotenv(os.path.join(script_dir, ".env.local"))

CONVEX_URL = os.getenv("CONVEX_URL") or os.getenv("NEXT_PUBLIC_CONVEX_URL")
if not CONVEX_URL:
    print("Error: CONVEX_URL or NEXT_PUBLIC_CONVEX_URL not set")
    sys.exit(1)

# Batch size for embedding and pushing
BATCH_SIZE = 100

# OpenAI API config
OPENAI_API_URL = "https://api.openai.com/v1/embeddings"
OPENAI_MODEL = "text-embedding-3-small"
OPENAI_DIMENSIONS = 1024  # Match existing schema


def embed_with_openai(texts: list[str], api_key: str) -> list[list[float]]:
    """Embed texts using OpenAI API. Returns list of embedding vectors."""
    response = requests.post(
        OPENAI_API_URL,
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {api_key}",
        },
        json={
            "model": OPENAI_MODEL,
            "input": texts,
            "dimensions": OPENAI_DIMENSIONS,
        },
    )

    if not response.ok:
        raise RuntimeError(f"OpenAI API error: {response.status_code} - {response.text}")

    data = response.json()
    return [item["embedding"] for item in data["data"]]


def main():
    parser = argparse.ArgumentParser(description="Embed tasting notes for semantic search")
    parser.add_argument("--dry-run", action="store_true", help="Preview without pushing")
    parser.add_argument("--all", action="store_true", help="Re-embed all notes (even existing)")
    parser.add_argument("--openai", action="store_true", help="Use OpenAI API (text-embedding-3-small, 1024 dims)")
    parser.add_argument("-v", "--verbose", action="store_true", help="Verbose output")
    args = parser.parse_args()

    # Check for OpenAI API key if using --openai
    openai_api_key = os.getenv("OPENAI_API_KEY")
    if args.openai and not openai_api_key:
        print("Error: OPENAI_API_KEY not set (required for --openai)")
        sys.exit(1)

    # Load local model only if not using OpenAI
    model = None
    if not args.openai:
        from sentence_transformers import SentenceTransformer
        print("Loading e5-large-v2 model...")
        model = SentenceTransformer("intfloat/e5-large-v2")
    else:
        print(f"Using OpenAI API ({OPENAI_MODEL}, {OPENAI_DIMENSIONS} dims)...")

    print("Connecting to Convex...")
    client = ConvexClient(CONVEX_URL)

    if args.all:
        # Get all distinct notes from coffees
        print("Fetching all distinct notes from coffees...")
        coffees = client.query("coffees:getAll", {})
        all_notes = set()
        for coffee in coffees:
            for note in coffee.get("notes", []):
                all_notes.add(note.lower())
        notes = sorted(all_notes)
        print(f"Found {len(notes)} distinct notes")
    else:
        print("Fetching notes missing embeddings...")
        notes = client.query("noteEmbeddings:getMissingEmbeddings", {})
        print(f"Found {len(notes)} notes to embed")

    if not notes:
        print("No notes need embedding!")
        return

    # Process in batches
    total_embedded = 0
    for i in range(0, len(notes), BATCH_SIZE):
        batch = notes[i : i + BATCH_SIZE]
        print(f"\nProcessing batch {i // BATCH_SIZE + 1} ({len(batch)} notes)...")

        if args.verbose:
            for note in batch:
                print(f"  {note}")

        # Generate embeddings
        print("  Generating embeddings...")
        if args.openai:
            embeddings = embed_with_openai(batch, openai_api_key)
        else:
            # e5-large-v2 - use "passage:" prefix for documents
            texts = [f"passage: {note}" for note in batch]
            embeddings = model.encode(texts, normalize_embeddings=True)

        if args.dry_run:
            print(f"  [DRY RUN] Would upsert {len(batch)} notes")
            total_embedded += len(batch)
            continue

        # Push to Convex
        print("  Pushing to Convex...")
        entries = [
            {
                "note": note,
                "embedding": embedding if isinstance(embedding, list) else embedding.tolist(),
            }
            for note, embedding in zip(batch, embeddings)
        ]
        result = client.mutation("noteEmbeddings:batchUpsert", {"entries": entries})
        total_embedded += result.get("inserted", 0) + result.get("updated", 0)
        print(f"  Inserted: {result.get('inserted', 0)}, Updated: {result.get('updated', 0)}")

    print(f"\n{'[DRY RUN] Would have embedded' if args.dry_run else 'Embedded'} {total_embedded} notes")


if __name__ == "__main__":
    main()
