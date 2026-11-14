# Getting started

This guide runs clevex on your own machine. Plan on about ten minutes.

## Prerequisites

- **Node.js 22 or newer**
- **pnpm 10**. Run `corepack enable` and pnpm installs itself at the version
  pinned in `package.json`.
- **A Convex account.** It's free at [convex.dev](https://convex.dev).
  `npx convex dev` asks you to log in the first time you run it.
- **Optional: [Tectonic](https://tectonic-typesetting.github.io/)** for fast,
  private local compiles:
  - macOS: `brew install tectonic`
  - Linux: `curl --proto '=https' --tlsv1.2 -fsSL https://drop-sh.fullyjustified.net | sh`,
    or your distro's package
  - Windows: `scoop install tectonic` or `choco install tectonic`

  Without Tectonic, clevex sends compiles to a public LaTeX-on-HTTP service
  (`latex.ytotech.com`). See [Compiling](#compiling).

## 1. Clone and install

```bash
git clone https://github.com/MohtashamMurshid/clevex.git
cd clevex
pnpm install
```

## 2. Create a Convex dev deployment

```bash
npx convex dev
```

On the first run, this command:

1. Logs you in to Convex.
2. Creates a project and a **dev deployment** for it.
3. Writes `.env.local` with `CONVEX_DEPLOYMENT`, `NEXT_PUBLIC_CONVEX_URL` and
   `NEXT_PUBLIC_CONVEX_SITE_URL`.
4. Pushes the functions in `convex/` and keeps watching them for changes.

Leave it running.

## 3. Configure auth on the deployment

Better Auth runs inside Convex and reads its settings from the Convex
deployment's environment, not from `.env.local`. In a second terminal:

```bash
npx convex env set SITE_URL http://localhost:3000
npx convex env set BETTER_AUTH_SECRET "$(openssl rand -base64 32)"
```

You don't need to add anything to `.env.local` yourself. `.env.example` lists
every variable the app reads. See [Configuration](configuration.md) for
what each one does.

## 4. Start the app

```bash
pnpm dev
```

Open <http://localhost:3000>. The landing page is at `/` and your projects are at
`/app`.

1. **Sign up** with an email and password. Accounts live in your own Convex
   deployment.
2. **Create a project** from a template: research paper, lecture notes, Beamer
   slides, or a blank document.
3. **Connect a model.** Click **ChatGPT** or **Claude** in the top bar and sign
   in. Running locally gives you the smoothest options, such as automatic
   ChatGPT redirect handling and one-click import of existing Codex CLI or
   Claude Code logins. See [Connecting ChatGPT & Claude](providers.md).
4. Press **⌘S** (Ctrl+S on Windows/Linux) to compile, and **⌘J** to open the AI
   chat.

## Compiling

The `/api/compile` route chooses an engine like this:

| `CLEVEX_COMPILER` | Behavior |
| --- | --- |
| `auto` (default) | Uses Tectonic if it can find it, otherwise the remote service |
| `tectonic` | Tectonic only, and errors if it's missing |
| `remote` | Always uses `CLEVEX_LATEX_REMOTE_URL` |

clevex looks for Tectonic in `$TECTONIC_BIN`, then on your `PATH`, then in
`/opt/homebrew/bin`, `/usr/local/bin` and `~/.cargo/bin`. The first Tectonic
compile downloads the LaTeX packages it needs and caches them, so it can take a
minute. Later compiles take well under a second.

With the remote service, your project files are sent to that service. To keep
documents private without Tectonic, run your own
[LaTeX-on-HTTP](https://github.com/YtoTech/latex-on-http) instance and point
`CLEVEX_LATEX_REMOTE_URL` at it.

## Everyday commands

| Command | What it does |
| --- | --- |
| `pnpm dev` | Next.js dev server (also copies the PDF.js worker into `public/`) |
| `npx convex dev` | Syncs `convex/` to your dev deployment. Keep it running while you edit backend code. |
| `pnpm lint` | ESLint |
| `pnpm typecheck` | `tsc --noEmit`. Run `pnpm exec next typegen` first on a fresh clone. |
| `pnpm test` | Unit tests in `tests/` using Node's built-in test runner |
| `pnpm build` | Production build |

## Troubleshooting

**"Sign in to use clevex." or a redirect loop to `/sign-in`**: The session
cookie is missing or doesn't match. Check that `SITE_URL` on the Convex
deployment matches the origin you're using exactly (`localhost` and `127.0.0.1`
count as different origins). To use both, add the other one to
`TRUSTED_ORIGINS`.

**Sign-up fails with "Sign-ups are closed"**: `AUTH_ALLOWED_EMAILS` is set on
the deployment and your email isn't in it.

**`BETTER_AUTH_SECRET` errors in the Convex logs**: You skipped step 3. Set the
variable and Convex picks it up immediately.

**Typecheck complains about missing route types**: Run `pnpm exec next typegen`.

**The PDF viewer is blank**: The PDF.js worker didn't get copied. Run
`node scripts/copy-pdf-worker.mjs` (`pnpm dev` and `pnpm build` normally do it).

**Port 1455 is already in use** when you sign in with ChatGPT: Another app,
often the Codex CLI's own login, is listening there. Close it and try again, or
use the paste-the-URL flow described in [providers.md](providers.md#chatgpt).

**Claude replies fail with 401 or 403 on a subscription token**: See
[the Claude caveat](providers.md#claude). Using an Anthropic API key always
works.
