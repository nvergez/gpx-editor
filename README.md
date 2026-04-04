<p align="center">
  <img src="public/logo.png" width="120" alt="Lapcraft logo" />
</p>

# Lapcraft

A browser-based tool for analyzing, editing, and crafting your activity laps. Upload GPX/TCX files, edit laps (split, merge, rename, reorder, delete), and export — all without losing any original XML data.

## Features

- **Lossless round-trip editing** — the original XML DOM is kept in memory and mutated directly, so unknown elements, attributes, and formatting are preserved on export
- **Split laps** — pick a trackpoint to split a lap into two
- **Merge laps** — combine adjacent laps into one
- **Rename laps** — inline name editing
- **Reorder & delete laps**
- **Undo / redo** — full undo/redo support for all lap mutations
- **Cross-format export** — convert GPX to TCX or vice versa (lossy, with confirmation)
- **AI chat assistant** — "Trail Companion" lets you edit activities via natural language (rename, split, merge, delete laps); destructive actions require approval
- **Custom columns** — add manual data columns or computed columns with formulas (divide, multiply, add, subtract) to the lap table; column definitions are shared across activities
- **CSV export** — export lap data including custom column values
- **Interactive map** — per-lap track visualization on an interactive map
- **Charts** — elevation, heart rate, and pace charts plus a lap pace bar chart
- **Strava import** — OAuth-based Strava activity picker to import activities directly
- **Activity persistence** — activities are saved to Convex with URL slugs for dedicated activity pages
- **Authentication** — email/password auth via Better Auth on Convex
- **Stats** — distance (haversine), duration, elevation, and pace computed per lap
- **Dark mode** — automatic light/dark theme support

## Getting Started

Requires **Node 24** and **pnpm**.

```bash
pnpm install
pnpm convex:dev
pnpm dev
```

`pnpm convex:dev` configures or connects a Convex deployment, pushes the backend
functions in [`convex/`](./convex), and generates the local `.env.local`
values used by TanStack Start. Run it in one terminal and keep it running while
developing. Then start the app with `pnpm dev` in a second terminal.

The app server starts at `http://localhost:3000`.

## Auth Setup

This repo uses **Better Auth on top of Convex**, following the TanStack Start
guide from Convex Labs.

Before signing in locally, set the required Convex environment variables:

```bash
pnpm exec convex env set BETTER_AUTH_SECRET "$(openssl rand -base64 32)"
pnpm exec convex env set SITE_URL http://localhost:3000
```

Then run:

```bash
pnpm convex:dev
```

That command will create or refresh `.env.local` with values like
`CONVEX_DEPLOYMENT`, `VITE_CONVEX_URL`, and `VITE_CONVEX_SITE_URL`. A template
is available in [`.env.example`](./.env.example).

## Strava Setup

To enable importing activities from Strava, create an API application at
[strava.com/settings/api](https://www.strava.com/settings/api) and set the
client credentials as Convex environment variables:

```bash
pnpm exec convex env set STRAVA_CLIENT_ID <your-client-id>
pnpm exec convex env set STRAVA_CLIENT_SECRET <your-client-secret>
```

## Scripts

| Command               | Description                                        |
| --------------------- | -------------------------------------------------- |
| `pnpm dev`            | Start the Vite dev server                          |
| `pnpm convex:dev`     | Start Convex dev, push functions, and generate env |
| `pnpm convex:codegen` | Regenerate Convex types after backend changes      |
| `pnpm build`          | Production build (Vite + TypeScript type check)    |
| `pnpm preview`        | Preview the production build locally               |
| `pnpm start`          | Run the production server                          |

## Tech Stack

- [TanStack Start](https://tanstack.com/start) (SSR via Nitro) + [React 19](https://react.dev)
- [Convex](https://convex.dev) backend (activity storage, auth)
- [Better Auth](https://www.better-auth.com) for authentication
- [TypeScript](https://www.typescriptlang.org) (strict mode)
- [TailwindCSS v4](https://tailwindcss.com) with oklch color themes
- [shadcn/ui](https://ui.shadcn.com) components (built on Base UI, not Radix)
- [Recharts](https://recharts.org) for data visualization
- [Lucide](https://lucide.dev) icons

## How It Works

When a GPX or TCX file is uploaded, it is parsed into a live DOM `Document` that stays in memory for the entire editing session. Every edit operation (split, merge, rename, reorder, delete) mutates the DOM directly rather than converting to an intermediate data model. This means the exported file retains all original structure — custom extensions, metadata, and attributes pass through untouched.

A `revision` counter triggers React recomputation of derived state (lap handles, stats) after each mutation.

Cross-format exports (GPX → TCX or TCX → GPX) necessarily lose format-specific data and require explicit user confirmation.

## License

[MIT](./LICENSE)
