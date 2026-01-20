#!/usr/bin/env python3
"""
Compare fuse.js-style fuzzy search vs vector embedding search vs hybrid for tasting notes.

Usage:
    python compare.py "fruity"
    python compare.py "choclate"  # typo test
    python compare.py "stone fruit vibes"
"""

import argparse
import os
import sys
import time

from convex import ConvexClient
from dotenv import load_dotenv
from sentence_transformers import SentenceTransformer
import numpy as np
from rapidfuzz import fuzz, process as fuzz_process

# Load .env
script_dir = os.path.dirname(__file__)
load_dotenv(os.path.join(script_dir, "../../.env.local"))
load_dotenv(os.path.join(script_dir, ".env.local"))

CONVEX_URL = os.getenv("CONVEX_URL") or os.getenv("NEXT_PUBLIC_CONVEX_URL")
if not CONVEX_URL:
    print("Error: CONVEX_URL or NEXT_PUBLIC_CONVEX_URL not set")
    sys.exit(1)


def fuzzy_search(query: str, notes: list[str], limit: int = 10) -> list[tuple[str, float]]:
    """
    Fuse.js-style fuzzy search using rapidfuzz.
    Returns (note, score) tuples.
    """
    words = query.lower().split()
    candidates = {}

    for word in words:
        if len(word) < 3:
            continue

        # Exact/substring matches (like the current implementation)
        for note in notes:
            note_lower = note.lower()
            if note_lower in word or word in note_lower:
                candidates[note] = max(candidates.get(note, 0), 1.0)

        # Fuzzy matches using rapidfuzz
        matches = fuzz_process.extract(
            word,
            notes,
            scorer=fuzz.ratio,
            limit=5,
            score_cutoff=60,  # Similar to fuse.js threshold 0.4
        )
        for match, score, _ in matches:
            candidates[match] = max(candidates.get(match, 0), score / 100.0)

    # Also try full query for multi-word notes
    full_matches = fuzz_process.extract(
        query,
        notes,
        scorer=fuzz.ratio,
        limit=5,
        score_cutoff=50,
    )
    for match, score, _ in full_matches:
        candidates[match] = max(candidates.get(match, 0), score / 100.0)

    # Sort by score and return
    sorted_candidates = sorted(candidates.items(), key=lambda x: x[1], reverse=True)
    return sorted_candidates[:limit]


def vector_search(
    query: str,
    model: SentenceTransformer,
    note_embeddings: dict[str, np.ndarray],
    limit: int = 10,
    threshold: float = 0.75,
) -> list[tuple[str, float]]:
    """
    Vector similarity search using cosine similarity.
    Returns (note, score) tuples.
    """
    # Embed query (use "query:" prefix for e5)
    query_embedding = model.encode(f"query: {query}", normalize_embeddings=True)

    # Compute cosine similarities (dot product since normalized)
    similarities = []
    for note, embedding in note_embeddings.items():
        similarity = np.dot(query_embedding, embedding)
        if similarity >= threshold:
            similarities.append((note, float(similarity)))

    # Sort by similarity descending
    similarities.sort(key=lambda x: x[1], reverse=True)
    return similarities[:limit]


def hybrid_search(
    query: str,
    notes: list[str],
    model: SentenceTransformer,
    note_embeddings: dict[str, np.ndarray],
    limit: int = 10,
    vector_threshold: float = 0.75,
) -> list[tuple[str, float]]:
    """
    Hybrid search combining fuse.js and vector search.
    - Fuse provides typo correction and exact matches
    - Vector provides semantic expansion
    - Scores are combined with weighting
    """
    # Get results from both methods
    fuzzy_results = fuzzy_search(query, notes, limit=20)
    vector_results = vector_search(query, model, note_embeddings, limit=20, threshold=vector_threshold)

    # Combine scores with weighting
    # Fuzzy: good for exact/typo matches
    # Vector: good for semantic similarity
    combined = {}

    # Add fuzzy results (weight: 0.4)
    for note, score in fuzzy_results:
        combined[note] = combined.get(note, 0) + score * 0.4

    # Add vector results (weight: 0.6, normalized to 0-1 range from 0.75-1.0)
    for note, score in vector_results:
        # Normalize score from threshold-1.0 to 0-1
        normalized = (score - vector_threshold) / (1.0 - vector_threshold)
        combined[note] = combined.get(note, 0) + normalized * 0.6

    # Sort by combined score
    sorted_results = sorted(combined.items(), key=lambda x: x[1], reverse=True)
    return sorted_results[:limit]


def main():
    parser = argparse.ArgumentParser(description="Compare fuzzy vs vector vs hybrid note search")
    parser.add_argument("query", help="Search query")
    parser.add_argument("--limit", type=int, default=10, help="Max results per method")
    args = parser.parse_args()

    print("Loading e5-large-v2 model...")
    model = SentenceTransformer("intfloat/e5-large-v2")

    print("Connecting to Convex...")
    client = ConvexClient(CONVEX_URL)

    print("Fetching note embeddings...")
    embeddings_data = client.query("noteEmbeddings:getAll", {})
    note_embeddings = {e["note"]: np.array(e["embedding"]) for e in embeddings_data}
    notes = list(note_embeddings.keys())
    print(f"Loaded {len(notes)} note embeddings")

    query = args.query
    print(f"\n{'='*60}")
    print(f"Query: '{query}'")
    print(f"{'='*60}")

    # Fuzzy search
    print("\n--- FUSE (fuzzy string matching) ---")
    start = time.time()
    fuzzy_results = fuzzy_search(query, notes, args.limit)
    fuzzy_time = (time.time() - start) * 1000
    print(f"Time: {fuzzy_time:.1f}ms")
    print(f"Results ({len(fuzzy_results)}):")
    for note, score in fuzzy_results:
        print(f"  {note} ({score:.2f})")

    # Vector search
    print("\n--- VECTOR (semantic embeddings) ---")
    start = time.time()
    vector_results = vector_search(query, model, note_embeddings, args.limit)
    vector_time = (time.time() - start) * 1000
    print(f"Time: {vector_time:.1f}ms (includes query embedding)")
    print(f"Results ({len(vector_results)}):")
    for note, score in vector_results:
        print(f"  {note} ({score:.3f})")

    # Hybrid search
    print("\n--- HYBRID (fuse + vector combined) ---")
    start = time.time()
    hybrid_results = hybrid_search(query, notes, model, note_embeddings, args.limit)
    hybrid_time = (time.time() - start) * 1000
    print(f"Time: {hybrid_time:.1f}ms")
    print(f"Results ({len(hybrid_results)}):")
    for note, score in hybrid_results:
        print(f"  {note} ({score:.2f})")

    # Analysis
    print(f"\n{'='*60}")
    print("COMPARISON")
    print(f"{'='*60}")

    fuzzy_set = set(r[0] for r in fuzzy_results)
    vector_set = set(r[0] for r in vector_results)
    hybrid_set = set(r[0] for r in hybrid_results)

    print(f"\nUnique to FUSE: {fuzzy_set - vector_set - hybrid_set or 'none'}")
    print(f"Unique to VECTOR: {vector_set - fuzzy_set - hybrid_set or 'none'}")
    print(f"In HYBRID but not FUSE: {hybrid_set - fuzzy_set or 'none'}")
    print(f"In HYBRID but not VECTOR: {hybrid_set - vector_set or 'none'}")

    print(f"\nOverlap:")
    print(f"  FUSE ∩ VECTOR: {len(fuzzy_set & vector_set)}")
    print(f"  FUSE ∩ HYBRID: {len(fuzzy_set & hybrid_set)}")
    print(f"  VECTOR ∩ HYBRID: {len(vector_set & hybrid_set)}")
    print(f"  All three: {len(fuzzy_set & vector_set & hybrid_set)}")


if __name__ == "__main__":
    main()
