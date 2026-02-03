# Brewnanza

TypeScript monorepo for coffee search. Convex backend + Next.js frontend.

## Package Manager

**Use bun** for all package operations. Never use npm, yarn, or pnpm.

```bash
bun install              # install all deps
bun add <pkg>            # add dependency
bun add -d <pkg>         # add dev dependency
bun remove <pkg>         # remove dependency
bun run <script>         # run script
```

## Monorepo Structure

```
coffee-scraper/
├── apps/web/            # Next.js frontend
├── packages/scraper/    # Coffee scraper lib
├── convex/              # Convex backend
├── bun.lock             # Bun lockfile
└── turbo.json           # Turborepo config
```

## Development

```bash
# From root
bun install
bun run dev              # Start all services

# From apps/web
bun run dev              # Start Next.js only
```

## Stack

- **Frontend**: Next.js 15, React 19, Tailwind CSS, Radix UI
- **Backend**: Convex (database, functions, crons)
- **Styling**: Tailwind + tailwind-merge + clsx
- **Scraper**: TypeScript, cheerio, Claude AI for extraction

## Convex

`bun run dev` starts Convex alongside Next.js automatically. If running separately:
- `bunx convex dev` - watch mode (syncs on file changes)
- `bunx convex dev --once` - sync once and exit

## Scraper Commands

Run from project root:

```bash
bun run scrape                    # Scrape + embed (full flow)
bun run scrape:no-embed           # Scrape only (no embedding)
bun run scrape:no-embed <id>      # Scrape specific roasters
bun run scrape:only-embed         # Embed only (no scraping)
bun run scrape:test <id>          # Test extraction, output to JSON
bun run scrape:list               # List available roaster IDs
```

**Flags:** `--dry-run` (preview), `-v` (verbose), `--force-ai` (re-extract all)

### Flow

1. Scrape catalog from roaster website
2. Diff against DB (fetch active URLs)
3. Update existing items (price/availability)
4. Deactivate removed items
5. AI extract new items (qualify + enrich)
6. Push new items to Convex
7. Embed new tasting notes

### Examples

```bash
bun run scrape:test lacabra            # Test La Cabra extraction
bun run scrape:no-embed lacabra -v     # Scrape one roaster, verbose
bun run scrape:no-embed --dry-run      # Preview all changes (no push)
```

### Available Roasters

Run `bun run scrape:list` to see all IDs. Current roasters:
lacabra, tanat, jera, kbcoffee, friedhats, devocion, april, standout, etc.

## Shipping Commands

Check shipping availability and prices for roasters.

```bash
bun run shipping:check <COUNTRY>   # Check shipping to country (e.g., IL, US, GB)
bun run shipping:check IL --dry-run # Preview without pushing to Convex
bun run shipping:check US -v        # Verbose output
```

Supported country codes: IL, US, GB, DE, NL, DK, SE, FR, ES, IT, CA, AU, JP

### Platform Support

- **Shopify**: friedhats, lacabra, kbcoffee, devocion, april, standout, coffeeorg, hydrangea, datura, scenery
- **WooCommerce**: tanat, manhattan, amoc, jera
- **SPA (Playwright)**: dak, youneedcoffee

### Adding a New Roaster

When adding a new roaster, check if existing proxy sources or aggregators carry their coffees:

1. **Check aggregators** for pre-extracted data:
   - **The Bean Geek** (thebeangeek.com) - `/roastery/{slug}` has tasting notes, origin, variety, process
   - Good for: DAK, La Cabra, Manhattan, Tanat, KB, Friedhats, Scenery, Standout, April, Devocion
   - Note: Historical data - may not match current inventory

2. **Check resellers** for product HTML (used for AI extraction):
   - **Sigma Coffee UK** (sigmacoffee.co.uk) - DAK, Hydrangea, Tanat
   - **Dayglow** (dayglow.coffee) - DAK, Morgon, Luna, Quo, Fritz
   - **My God Shot** (mygodshot.com) - DAK
   - Look for Shopify `/products.json` or WooCommerce REST API

3. **Add as proxy source** in `packages/scraper/src/proxy-sources.ts`
   - Aggregators: Add to `BEANGEEK_ROASTER_MAP` in `beangeek.ts`
   - Resellers: Add to `PROXY_SOURCES` array

4. **For SPA roasters** (require Playwright): proxy sources are tried first (fast), Playwright is fallback (slow)

## Embedder Commands

Run from project root:

```bash
bun run scrape:only-embed  # Embed coffee tasting notes
bun run embed:vocab        # Build vocabulary cache (only when adding new search terms)
```
