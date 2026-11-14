<img src="assets/icon.svg" width="64" height="64" alt="">

# clevex

An AI-native LaTeX workspace (in the spirit of OpenAI's Prism) that runs on the
**ChatGPT and Claude subscriptions you already pay for**. A cleave.ai side
project, styled with the Cleve design system.

- **Editor**: CodeMirror 6 with LaTeX highlighting, autocomplete for commands,
  environments, `\ref` labels and `\cite` keys, inline compile errors.
- **Live PDF**: compiles on save (⌘S) or automatically while you type. Uses
  local [Tectonic](https://tectonic-typesetting.github.io/) when installed,
  otherwise a LaTeX-on-HTTP service (works on Vercel).
- **AI chat** that sees every file in the project and proposes edits as diffs
  you can apply, dismiss or undo. Pick GPT or Claude models and a reasoning
  effort level.
- **⌘K inline edits**: select text, describe the change, accept or retry.
- **Fix with AI**: one click sends compile errors and the log to the model.
- **Citations**: search arXiv and add BibTeX to your `.bib` in one click.
- **Images → LaTeX**: paste a photo of a whiteboard or handwriting into chat.
- **Voice dictation**, outline view, word count, multi-file projects, `.zip`
  import/export, light and dark themes, mobile layout.

Projects live in your browser (IndexedDB). Export a `.zip` to back them up.

## Run it

```bash
pnpm install
pnpm dev          # http://localhost:3000
```

Install Tectonic for fast, private local compiles (`brew install tectonic`).
Without it, clevex compiles through `latex.ytotech.com`.

## Connecting your subscriptions

Open **Connect** (top right). Tokens are stored only in your browser. The
server routes are stateless proxies that forward each request with the
caller's own token.

**ChatGPT (Plus / Pro / Business)**: *Sign in with ChatGPT* uses the same
public OAuth client as the Codex CLI (PKCE, redirect to `localhost:1455`).

- Running locally, clevex catches the redirect itself and finishes sign-in.
- On a deployed site, the browser lands on a `localhost:1455` page that won't
  load. Copy that URL from the address bar and paste it into clevex.
- Or import an existing Codex CLI login (`~/.codex/auth.json`). Imported
  sessions are never refreshed by clevex, so your CLI keeps working.

**Claude (Pro / Max)**: *Sign in with Claude* uses Claude Code's OAuth
client. After you approve, Claude shows a code; paste it back. You can also
paste a long-lived token from `claude setup-token`, import Claude Code's login
when running locally, or use an Anthropic API key.

> ⚠️ Anthropic's terms limit Claude subscription OAuth tokens to its own apps.
> Since early 2026 it may reject them in third-party tools or bill them as extra
> usage. If Claude replies fail, use an API key. This project is for personal
> use.

## Deploy to Vercel

The app is a standard Next.js 16 project. It deploys with no config:

```bash
vercel deploy
```

Optional environment variables (see `.env.example`):

| Variable | What it does |
| --- | --- |
| `CLEVEX_PASSWORD` | Locks the whole site behind a password. **Set this** if you add a server token. |
| `CLAUDE_CODE_OAUTH_TOKEN` | A `claude setup-token` token. Lets the deployment use your Claude plan without a browser login. |
| `CLEVEX_COMPILER` | `auto` (default), `tectonic`, or `remote`. |
| `CLEVEX_LATEX_REMOTE_URL` | Your own LaTeX-on-HTTP endpoint. |
| `CLEVEX_OPENAI_BASE_URL` / `CLEVEX_OPENAI_API_KEY` | Optional OpenAI Responses-compatible gateway (for example a self-hosted CLIProxyAPI). |
| `CLEVEX_ANTHROPIC_BASE_URL` / `CLEVEX_ANTHROPIC_API_KEY` | Optional Anthropic Messages-compatible gateway. |

On Vercel, the "import from this computer" buttons and the local OAuth
callback catcher are turned off automatically.

## Project layout

```
src/app/api/        stateless routes: auth token exchange, AI streaming, compile, arXiv
src/lib/auth/       OAuth (PKCE) flows and browser credential store
src/lib/ai/         model list, prompts, edit-block parser, streaming client
src/components/     dashboard, connect dialog, workspace (editor, PDF, chat, sidebar)
src/components/ui/  coss ui components (shadcn registry), themed with Cleve tokens
```

## Scripts

`pnpm dev` · `pnpm build` · `pnpm lint` · `pnpm typecheck`
