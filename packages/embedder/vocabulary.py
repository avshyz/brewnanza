#!/usr/bin/env python3
"""
Build vocabulary cache for semantic search.
Pre-computes embeddings and LLM mappings for common barista terms.

Usage:
    bun run vocab           # Build vocabulary cache
    bun run vocab --dry-run # Preview without pushing
"""

import argparse
import json
import os
import sys

import anthropic
from convex import ConvexClient
from dotenv import load_dotenv
from sentence_transformers import SentenceTransformer

# Load .env from project root (try multiple locations)
script_dir = os.path.dirname(__file__)
load_dotenv(os.path.join(script_dir, "../../.env.local"))
load_dotenv(os.path.join(script_dir, ".env.local"))

CONVEX_URL = os.getenv("CONVEX_URL") or os.getenv("NEXT_PUBLIC_CONVEX_URL")
ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY")

if not CONVEX_URL:
    print("Error: CONVEX_URL or NEXT_PUBLIC_CONVEX_URL not set")
    sys.exit(1)

if not ANTHROPIC_API_KEY:
    print("Error: ANTHROPIC_API_KEY not set")
    sys.exit(1)

# Common barista terms for vocabulary cache
VOCABULARY = [
    # Flavor profiles
    "funky",
    "fruity",
    "floral",
    "jammy",
    "winey",
    "boozy",
    "bright",
    "crisp",
    "clean",
    "tea-like",
    "complex",
    "syrupy",
    "juicy",
    "sweet",
    "chocolatey",
    "nutty",
    "caramelly",
    # Compound terms
    "berry bomb",
    "fruit bomb",
    "fruit forward",
    "clean cup",
    "wild ferment",
    "heavy body",
    "light body",
    "silky mouthfeel",
    # Process-related
    "natural sweetness",
    "washed clarity",
    "honey process",
    "anaerobic funk",
    "carbonic",
    # Origin vibes
    "Ethiopian character",
    "Kenyan acidity",
    "Colombian balance",
    "Gesha-like",
    # Roast profiles
    "light roast",
    "medium roast",
    "filter roast",
    "espresso roast",
    "omni roast",
    # Experience descriptors
    "easy drinking",
    "crowd pleaser",
    "interesting",
    "unique",
    "classic",
    "experimental",
]

# All available tasting notes (from tasting-notes.ts)
ALL_NOTES = [
    # Stone fruits
    "peach", "apricot", "nectarine", "plum", "cherry", "black cherry", "stone fruit", "prune", "persimmon",
    # Citrus
    "citrus", "orange", "blood orange", "tangerine", "mandarin", "lemon", "lime", "grapefruit", "bergamot", "yuzu",
    # Berry
    "berry", "berries", "red berries", "dark berries", "blueberry", "raspberry", "strawberry", "blackberry",
    "blackcurrant", "redcurrant", "cranberry", "gooseberry",
    # Tropical
    "tropical", "mango", "pineapple", "papaya", "passion fruit", "guava", "lychee", "coconut", "banana", "kiwi",
    # Dried fruits
    "raisin", "date", "fig", "dried fruits", "fruitcake", "tamarind",
    # Orchard
    "apple", "green apple", "pear", "grape", "melon", "watermelon", "pomegranate",
    # Floral
    "floral", "jasmine", "rose", "lavender", "violet", "hibiscus", "honeysuckle", "geranium", "chamomile",
    # Sweet
    "honey", "caramel", "toffee", "fudge", "maple", "brown sugar", "molasses", "panela", "candy",
    # Chocolate
    "chocolate", "dark chocolate", "milk chocolate", "cocoa", "cacao",
    # Nutty
    "nutty", "almond", "hazelnut", "walnut", "pistachio", "macadamia", "pecan", "marzipan", "praline",
    # Spice
    "cinnamon", "cardamom", "ginger", "baking spice",
    # Tea
    "tea", "black tea", "green tea", "oolong", "darjeeling",
    # Wine
    "wine", "red wine", "brandy", "rum", "jammy",
    # Herbal
    "herbal", "lemongrass", "verbena", "eucalyptus", "tobacco",
    # Baked
    "brioche", "biscuit", "grains", "malt",
    # Creamy
    "cream", "custard", "vanilla", "butter",
    # Other
    "fresh", "crisp", "bright", "juicy", "complex",
    # Fermented/funky
    "fermented", "wild", "yeasty", "boozy", "winey",
]

# Common processes
ALL_PROCESSES = [
    "washed", "natural", "honey", "anaerobic", "carbonic maceration",
    "double fermentation", "extended fermentation", "thermal shock",
    "wet hulled", "semi-washed", "pulped natural",
]

SYSTEM_PROMPT = f"""You are a specialty coffee expert helping map barista jargon to specific tasting notes and processes.

Given a search term, return the most relevant tasting notes and coffee processes that match.

Available tasting notes:
{json.dumps(ALL_NOTES, indent=2)}

Available processes:
{json.dumps(ALL_PROCESSES, indent=2)}

Return JSON with:
- mappedNotes: array of specific notes from the list above (max 8)
- mappedProcesses: array of specific processes from the list above (max 3)

Examples:
- "funky" -> {{"mappedNotes": ["fermented", "wild", "yeasty", "boozy"], "mappedProcesses": ["natural", "anaerobic"]}}
- "berry bomb" -> {{"mappedNotes": ["berry", "blueberry", "strawberry", "raspberry", "blackberry", "jammy"], "mappedProcesses": ["natural"]}}
- "clean cup" -> {{"mappedNotes": ["tea", "crisp", "bright", "fresh"], "mappedProcesses": ["washed"]}}
- "jammy" -> {{"mappedNotes": ["strawberry", "raspberry", "red wine", "cherry", "berry"], "mappedProcesses": ["natural"]}}

Return ONLY valid JSON, no explanation."""


def get_llm_mappings(client: anthropic.Anthropic, term: str) -> dict:
    """Get LLM mappings for a term."""
    response = client.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=256,
        system=SYSTEM_PROMPT,
        messages=[{"role": "user", "content": f'Map this coffee search term: "{term}"'}],
    )

    try:
        text = response.content[0].text.strip()
        # Handle markdown code blocks
        if text.startswith("```"):
            text = text.split("```")[1]
            if text.startswith("json"):
                text = text[4:]
        return json.loads(text)
    except (json.JSONDecodeError, IndexError) as e:
        print(f"  Warning: Failed to parse LLM response for '{term}': {e}")
        return {"mappedNotes": [], "mappedProcesses": []}


def main():
    parser = argparse.ArgumentParser(description="Build vocabulary cache")
    parser.add_argument("--dry-run", action="store_true", help="Preview without pushing")
    parser.add_argument("-v", "--verbose", action="store_true", help="Verbose output")
    parser.add_argument("--terms", nargs="*", help="Specific terms to process (default: all)")
    args = parser.parse_args()

    terms = args.terms if args.terms else VOCABULARY

    print("Loading e5-large-v2 model...")
    model = SentenceTransformer("intfloat/e5-large-v2")

    print("Initializing Anthropic client...")
    anthropic_client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)

    print("Connecting to Convex...")
    convex_client = ConvexClient(CONVEX_URL)

    print(f"\nProcessing {len(terms)} vocabulary terms...")
    entries = []

    for i, term in enumerate(terms):
        print(f"[{i + 1}/{len(terms)}] {term}")

        # Get LLM mappings
        mappings = get_llm_mappings(anthropic_client, term)
        if args.verbose:
            print(f"  Notes: {mappings.get('mappedNotes', [])}")
            print(f"  Processes: {mappings.get('mappedProcesses', [])}")

        # Generate embedding (use "query:" prefix for search queries)
        embedding = model.encode(f"query: {term}", normalize_embeddings=True)

        entries.append({
            "term": term,
            "embedding": embedding.tolist(),
            "mappedNotes": mappings.get("mappedNotes", []),
            "mappedProcesses": mappings.get("mappedProcesses", []),
        })

    if args.dry_run:
        print(f"\n[DRY RUN] Would upsert {len(entries)} vocabulary entries")
        if args.verbose:
            for entry in entries:
                print(f"  {entry['term']}: {len(entry['mappedNotes'])} notes, {len(entry['mappedProcesses'])} processes")
        return

    # Push to Convex
    print(f"\nPushing {len(entries)} entries to Convex...")
    result = convex_client.mutation("vocabularyCache:batchUpsert", {"entries": entries})
    print(f"Inserted: {result.get('inserted', 0)}, Updated: {result.get('updated', 0)}")


if __name__ == "__main__":
    main()
