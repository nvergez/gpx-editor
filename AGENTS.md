# AGENTS.md

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
