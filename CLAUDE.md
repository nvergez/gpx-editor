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

**Lapcraft** — fitness activity analysis and editing platform built with TanStack Start (SSR via Nitro) + React 19 + TypeScript (strict). Supports GPX/TCX file editing, Strava activity import, AI-assisted editing, custom data columns, and data visualization.

### DOM-First Lossless Editing

The core design decision: the uploaded XML file is kept as a live DOM `Document` throughout the editing session. All mutations (delete, split, merge, rename, reorder laps) operate directly on this DOM. This preserves the original XML structure and unknown elements/attributes on export, enabling lossless round-trip editing. A `revision` counter bumps after each mutation to trigger React recomputation of derived state via `useMemo`. An undo/redo manager (`src/utils/undo-manager.ts`) tracks DOM mutation history.

Cross-format export (GPX→TCX or TCX→GPX) is lossy and requires user confirmation.

### AI Chat Assistant

"Trail Companion" — a conversational AI agent (`src/components/activity-chat.tsx`) that can edit activities via natural language. Uses AI SDK with streaming text and 6 tools: `renameActivity`, `renameLap`, `deleteLap`, `splitLap`, `mergeLaps`, `getLapDetails`. Non-destructive tools auto-execute; mutations require user approval. Server endpoint at `src/routes/api/chat.ts`. Tool definitions in `src/lib/tools/activity-tools.ts`.

### Custom Columns & CSV Export

Users can add custom data columns to the lap table (`src/components/customize-columns-dialog.tsx`):

- **Manual columns**: user-input values per lap
- **Computed columns**: formulas using built-in stats and manual columns as operands (divide, multiply, add, subtract, divideby)

Column definitions are shared across activities. CSV export (`src/utils/csv-export.ts`) includes all lap data plus custom column values.

### Activity Management & Persistence

Activities are stored in Convex with XML files in Convex file storage. The activity hub (`src/components/activity-hub.tsx`) supports file upload and Strava import. Activities are listed with search (`src/components/activity-list.tsx`, `src/components/activity-search.tsx`) and navigated via a sidebar (`src/components/activity-sidebar.tsx`). Each activity has a URL slug for direct linking (`src/routes/activities/$slug.tsx`).

### Strava Integration

OAuth-based activity import from Strava (`src/components/strava-activity-picker.tsx`). Converts Strava stream data to TCX format (`src/utils/strava-to-tcx.ts`). OAuth callback handled at `src/routes/strava/callback.tsx`.

### Authentication

Email/password authentication via Better Auth integrated with Convex (`src/components/auth-gate.tsx`). Auth server config in `convex/auth.ts` and `convex/auth.config.ts`. Client wrapper in `src/utils/auth-client.ts`.

### Data Visualization

- **Map**: Leaflet-based activity map with lap highlighting and track simplification (`src/components/activity-map.tsx`)
- **Elevation chart**: Elevation profile visualization (`src/components/elevation-chart.tsx`)
- **Pace chart**: Pace/speed analysis per lap (`src/components/lap-pace-chart.tsx`)

### Key Files

- `src/utils/dom-model.ts` — `ActivityDocument` (DOM wrapper) and `LapHandle` (UI lap representation) interfaces
- `src/utils/dom-operations.ts` — All DOM mutations: `parseToDocument()`, `deleteLap()`, `splitLap()`, `mergeLaps()`, `reorderLaps()`, `exportOriginal()`
- `src/utils/gpx-parser.ts` — GPX/TCX parsing to data structures, stats computation (haversine), cross-format export (`exportGpx()`, `exportTcx()`)
- `src/utils/undo-manager.ts` — DOM mutation undo/redo history
- `src/utils/custom-columns.ts` — Formula evaluation, operand resolution, column sorting
- `src/utils/csv-export.ts` — Lap data CSV export with custom columns
- `src/utils/strava-to-tcx.ts` — Strava stream-to-TCX conversion
- `src/utils/xml-storage.ts` — Convex file storage integration for XML
- `src/components/gpx-editor.tsx` — Main state container; owns `ActivityDocument` and all mutation callbacks
- `src/components/lap-table.tsx` — Interactive lap table with sorting and inline editing
- `src/components/split-dialog.tsx` — Interactive split point selector
- `src/components/activity-chat.tsx` — AI chat assistant (Trail Companion)
- `src/components/customize-columns-dialog.tsx` — Custom column management
- `src/lib/tools/activity-tools.ts` — AI tool definitions (6 tools with Zod schemas)
- `convex/schema.ts` — Database schema (activities, columnDefinitions, activityColumns, columnValues, stravaConnections)
- `convex/activities.ts` — Activity CRUD operations
- `convex/columns.ts` — Custom column CRUD, linking, and value storage

### Stack

- **Routing**: TanStack Router (file-based, `src/routes/`); route tree auto-generated as `routeTree.gen.ts`
- **Backend**: Convex (real-time database, file storage, auth)
- **Auth**: Better Auth (email/password) integrated with Convex
- **AI**: AI SDK with streaming text and tool calling (gpt-5.4-mini via OpenAI)
- **UI**: shadcn components (`src/components/ui/`) built on `@base-ui/react` (headless), not Radix
- **Styling**: TailwindCSS v4 with oklch CSS variables for light/dark themes (`src/styles/app.css`)
- **Maps**: Leaflet (react-leaflet) for activity visualization
- **State**: Zustand for chat UI state (`src/utils/chat-store.ts`)
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
