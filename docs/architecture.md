# Architecture

clevex is a Next.js 16 App Router app with a Convex backend. Most of the logic
runs in the browser. The Next.js server does four jobs: it proxies auth, proxies
AI calls, compiles LaTeX, and searches arXiv. It stores nothing.

## Repository layout

```
convex/                     Backend (runs on Convex)
  schema.ts                 projects, files, threads tables
  auth.ts, auth.config.ts   Better Auth + Convex adapter, sign-up allowlist
  http.ts                   HTTP router that mounts the Better Auth routes
  projects.ts files.ts threads.ts   queries/mutations, each one checks ownership
  lib.ts                    requireUserId / requireProject / blob refcounting

src/app/
  page.tsx                  marketing landing page
  sign-in/                  email + password sign-in / sign-up
  (app)/app/                project dashboard        ┐ signed-in only, wrapped in
  (app)/p/[id]/             the workspace            ┘ the Convex provider
  api/auth/[...all]/        proxies to Convex HTTP actions
  api/ai/{chatgpt,claude}/  streaming AI proxies (SSE)
  api/providers/*/token/    OAuth token exchange / refresh proxies
  api/local/*               localhost-only: credential import, ChatGPT callback catcher
  api/compile/              Tectonic or LaTeX-on-HTTP
  api/arxiv/                arXiv search → BibTeX
  api/config/               which server-side options exist (never secrets)
src/proxy.ts                Next 16 "proxy" (formerly middleware): optimistic auth gate

src/lib/
  ai/                       model list, prompts, edit-block parser, streaming client
  auth/                     OAuth PKCE flows and the browser credential store
  latex/                    log parser, outline and word count
  db.ts                     project data access (Convex)
  local-db.ts               IndexedDB: PDF cache + legacy local projects
  templates.ts zip.ts settings.ts …

src/components/
  workspace/                editor, PDF viewer, chat, inline AI, sidebar, log
  ui/                       coss ui components (shadcn registry), Cleve-themed
tests/                      node:test unit tests
```

## Auth and data

- **Accounts.** [Better Auth](https://better-auth.com) runs inside Convex
  through `@convex-dev/better-auth`, using email and password. The browser talks
  to `/api/auth/*` on the app's own origin, and Next.js forwards those requests
  to Convex HTTP actions, so cookies stay first-party.
- **Gatekeeping.** `src/proxy.ts` sends visitors without a session cookie from
  `/app` and `/p/*` to `/sign-in`, and returns 401 from the AI, compile, arXiv
  and provider APIs. This check is only optimistic. Authorization is enforced in
  Convex, where every function calls `requireUserId` or `requireProject` and
  compares `ownerId`.
- **Data model.**

  | Table | Fields | Notes |
  | --- | --- | --- |
  | `projects` | name, mainFile, template, compiler, accent | indexed by owner + `updatedAt` |
  | `files` | projectId, path, `content` _or_ `storageId` | text inline (max ≈900k characters); binaries in Convex file storage |
  | `threads` | projectId, key, title, messages[] | chat history; images in file storage |

  Duplicated projects share storage blobs. `releaseBlob` deletes a blob only
  after the last file pointing to it is gone.

## AI request flow

```
ChatPanel ──(system, project context, messages, model, effort, auth)──► /api/ai/<provider>
                                                                      │
          ◄──────── SSE: text / thinking / status / error / done ─────┘
```

1. `src/lib/ai/prompts.ts` builds the system prompt and a `<project>` context
   holding every text file, with the main file first and other `.tex` files next.
   The context is capped at about 350k characters.
2. `src/lib/ai/client.ts` gets a fresh credential, refreshing it if needed and
   allowed, then POSTs a `WireRequest` and reads back a server-sent event stream.
3. The route picks a credential in this order: the browser's token, then the
   server token, then a gateway. It calls the provider and converts the
   provider's stream into clevex's small event protocol (`src/lib/server/sse.ts`).
   - **ChatGPT**: the Responses API at `chatgpt.com/backend-api/codex`, with
     Codex CLI headers.
   - **Claude**: the Anthropic SDK with adaptive thinking. Subscription tokens
     add the OAuth beta header. The project context gets a prompt-cache
     breakpoint.
4. `src/lib/ai/edits.ts` parses edit blocks from the reply while it streams:

   ```
   <edit file="main.tex">
   <<<<<<< SEARCH
   exact text
   =======
   replacement
   >>>>>>> REPLACE
   </edit>
   ```

   or `<file path="…">full contents</file>` for new files. `applyHunk` first
   tries an exact match, then ignores trailing whitespace, then ignores
   indentation. If a hunk still doesn't match, the card reports it instead of
   guessing.

## Compiling

`POST /api/compile` receives `{ files, main, engine }`. Text files arrive as
strings and binaries as base64. File paths are checked against an allowlist
regex (no absolute paths and no `..`).

- **Tectonic**: files are written to a temp directory, then clevex runs
  `tectonic --keep-logs --outdir … main.tex` with a 100-second timeout. The temp
  directory is always removed afterwards.
- **Remote**: the files are POSTed to a LaTeX-on-HTTP `/builds/sync` endpoint.

`src/lib/latex/log.ts` turns either log into `{ level, file, line, message }`
entries, which the editor shows inline and the log panel lists.

## Design system

The UI uses [coss ui](https://coss.com/ui) components (Base UI and Tailwind 4)
installed through the shadcn registry in `components.json`. Colors, radii and
fonts come from the Cleve tokens in `src/app/globals.css`: warm "pebble"
neutrals, a "clay" brand color, and "paper" surfaces, with dark mode through the
`.dark` class. Fonts are Inter, Newsreader and Geist Mono.
