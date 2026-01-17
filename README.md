# Brewnanza

TypeScript monorepo for coffee search. Convex backend + Next.js frontend.

## Quick Start

```bash
bun install
bun run dev    # Start all services
```

## CLI Commands

### Development

| Command | Description |
|---------|-------------|
| `bun run dev` | Start all services (Turbo) |
| `bun run build` | Build all packages |
| `bun run lint` | Lint all packages |
| `bun run typecheck` | Typecheck all packages |

### Scraper

Run from root or `packages/scraper/`:

| Command | Description |
|---------|-------------|
| `bun run scrape` | Scrape all roasters |
| `bun run scrape <id> [id2...]` | Scrape specific roasters |
| `bun run scrape --dry-run` | Preview changes without pushing |
| `bun run scrape -v` | Verbose output |
| `bun run scrape:test <id>` | Test extraction, output JSON |
| `bun run scrape:list` | List available roaster IDs |
| `bun run cache:clear` | Clear AI extraction cache |

### Available Roasters

```
friedhats   lacabra     kbcoffee    tanat
coffeeorg   hydrangea   devocion    manhattan
datura      scenery     amoc        april
standout    jera
```

## Scraper Flow

```
1. Scrape catalog from roaster website
         ↓
2. Fetch active URLs from Convex DB
         ↓
3. Diff: updates | deactivations | new items
         ↓
4. Update existing items (price/availability)
         ↓
5. Deactivate removed items
         ↓
6. AI extract new items (qualify + enrich)
         ↓
7. Push new items to Convex
```

### Flags

- `--dry-run` - Preview changes, no DB writes
- `-v, --verbose` - Detailed logging
- `--list` - Show available roasters

### Examples

```bash
# Test La Cabra extraction (outputs output-lacabra.json)
bun run scrape:test lacabra

# Scrape multiple roasters with verbose output
bun run scrape lacabra tanat -v

# Preview all changes without pushing
bun run scrape --dry-run

# Clear cached AI extractions
bun run cache:clear
```

## Project Structure

```
coffee-scraper/
├── apps/web/            # Next.js frontend
├── packages/scraper/    # Scraper CLI + lib
│   ├── src/
│   │   ├── cli.ts              # Main CLI entry
│   │   ├── compare-extraction.ts  # Test extraction
│   │   ├── ai-extractor.ts     # AI extraction logic
│   │   ├── config.ts           # Roaster configs
│   │   └── scrapers/           # Scraper implementations
│   └── cache/           # AI extraction cache
├── convex/              # Convex backend
└── turbo.json           # Turborepo config
```

## Stack

- **Frontend**: Next.js 15, React 19, Tailwind CSS, Radix UI
- **Backend**: Convex (database, functions, crons)
- **Scraper**: TypeScript, cheerio, Claude AI for extraction

## Environment

```bash
CONVEX_SITE_URL=https://healthy-dodo-333.convex.site  # Default
ANTHROPIC_API_KEY=...  # For AI extraction
```
