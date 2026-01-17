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
- **Scraper**: TypeScript, cheerio
