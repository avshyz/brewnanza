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

Before changing schema or functions, ensure `bunx convex dev` is running (start in background if needed).

## Scraper Commands

Run from `packages/scraper/`:

```bash
bun run scrape                    # Scrape all roasters (diff + AI + push)
bun run scrape <id> [id2...]      # Scrape specific roasters
bun run scrape --dry-run          # Preview changes without pushing
bun run scrape -v                 # Verbose output
bun run scrape:test <id>          # Test extraction, output to JSON
bun run scrape:list               # List available roaster IDs
bun run cache:clear               # Clear AI extraction cache
```

### Flow

1. Scrape catalog from roaster website
2. Diff against DB (fetch active URLs)
3. Update existing items (price/availability)
4. Deactivate removed items
5. AI extract new items (qualify + enrich)
6. Push new items to Convex

### Examples

```bash
bun run scrape:test lacabra       # Test La Cabra extraction
bun run scrape lacabra tanat -v   # Scrape multiple, verbose
bun run scrape --dry-run          # Preview all changes (no push)
```

### Available Roasters

Run `bun run scrape:list` to see all IDs. Current roasters:
lacabra, tanat, jera, kbcoffee, friedhats, devocion, april, standout, etc.
