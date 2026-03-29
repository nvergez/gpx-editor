# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
pnpm dev          # Start dev server on port 3000
pnpm build        # Build for production (vite build + tsc --noEmit)
pnpm preview      # Preview production build
pnpm start        # Run production server (.output/server/index.mjs)
```

No test framework is configured.

## Architecture

GPX/TCX file editor built with TanStack Start (SSR via Nitro) + React 19 + TypeScript (strict).

### DOM-First Lossless Editing

The core design decision: the uploaded XML file is kept as a live DOM `Document` throughout the editing session. All mutations (delete, split, merge, rename, reorder laps) operate directly on this DOM. This preserves the original XML structure and unknown elements/attributes on export, enabling lossless round-trip editing. A `revision` counter bumps after each mutation to trigger React recomputation of derived state via `useMemo`.

Cross-format export (GPX→TCX or TCX→GPX) is lossy and requires user confirmation.

### Key Files

- `src/utils/dom-model.ts` — `ActivityDocument` (DOM wrapper) and `LapHandle` (UI lap representation) interfaces
- `src/utils/dom-operations.ts` — All DOM mutations: `parseToDocument()`, `deleteLap()`, `splitLap()`, `mergeLaps()`, `reorderLaps()`, `exportOriginal()`
- `src/utils/gpx-parser.ts` — GPX/TCX parsing to data structures, stats computation (haversine), cross-format export (`exportGpx()`, `exportTcx()`)
- `src/components/GpxEditor.tsx` — Main state container; owns `ActivityDocument` and all mutation callbacks
- `src/components/LapCard.tsx` — Individual lap display with inline name editing and action menu
- `src/components/SplitDialog.tsx` — Interactive split point selector

### Stack

- **Routing**: TanStack Router (file-based, `src/routes/`); route tree auto-generated as `routeTree.gen.ts`
- **UI**: shadcn components (`src/components/ui/`) built on `@base-ui/react` (headless), not Radix
- **Styling**: TailwindCSS v4 with oklch CSS variables for light/dark themes (`src/styles/app.css`)
- **Path alias**: `~/*` maps to `src/*`
- **Package manager**: pnpm (workspace setup)
- **Node**: v24 (`.nvmrc`)

<!-- intent-skills:start -->

# Skill mappings - when working in these areas, load the linked skill file into context.

skills:

- task: "Setting up routes, navigation, and file-based routing"
  load: "node_modules/@tanstack/react-start/skills/react-start/SKILL.md"

- task: "Route data loading, loaders, and caching"

  # To load this skill, run: npx @tanstack/intent@latest list | grep data-loading

  # Package: @tanstack/router-core (transitive dep)

- task: "Server functions, data fetching, and API endpoints"

  # To load this skill, run: npx @tanstack/intent@latest list | grep server-functions

  # Package: @tanstack/start-client-core (transitive dep)

- task: "Deploying or configuring the Nitro server / Vercel preset"
  load: "node_modules/nitro/skills/nitro/SKILL.md"

- task: "Working with search params or route path params" # To load this skill, run: npx @tanstack/intent@latest list | grep search-params # Package: @tanstack/router-core (transitive dep)
<!-- intent-skills:end -->

<!-- convex-ai-start -->

This project uses [Convex](https://convex.dev) as its backend.

When working on Convex code, **always read `convex/_generated/ai/guidelines.md` first** for important guidelines on how to correctly use Convex APIs and patterns. The file contains rules that override what you may have learned about Convex from training data.

Convex agent skills for common tasks can be installed by running `npx convex ai-files install`.

<!-- convex-ai-end -->
