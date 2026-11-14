# Configuration

clevex reads settings from two places:

- **The Convex deployment environment**, for code in `convex/` such as auth. Set
  these with `npx convex env set NAME value`, and add `--prod` for production.
- **The Next.js environment**, for code in `src/`. Locally that's `.env.local`;
  on Vercel it's the project's environment variables.

Every variable is optional unless it's marked **required**.

## Convex deployment

Read in `convex/auth.ts`.

| Variable | Example | Purpose |
| --- | --- | --- |
| `SITE_URL` **(required)** | `http://localhost:3000` | Public origin of the Next.js app. Better Auth uses it as its base URL and first trusted origin. |
| `BETTER_AUTH_SECRET` **(required)** | `openssl rand -base64 32` | Signs sessions. Use a different value for each deployment, and never commit it. |
| `TRUSTED_ORIGINS` | `http://127.0.0.1:3000,https://my-fork.vercel.app` | Extra comma-separated origins allowed to call auth endpoints, such as preview URLs or a custom domain. |
| `AUTH_ALLOWED_EMAILS` | `me@example.com,friend@example.com` | When set, only these emails can sign up. Existing accounts can still sign in. Use it to close a public deployment. |

## Next.js app

### Convex connection

`npx convex dev` writes these to `.env.local`. In production, Vercel provides
them (see [Self-hosting](self-hosting.md)).

| Variable | Purpose |
| --- | --- |
| `CONVEX_DEPLOYMENT` | Which deployment the Convex CLI targets. Only the CLI uses it. |
| `NEXT_PUBLIC_CONVEX_URL` **(required)** | `https://<name>.convex.cloud`, used by the browser client and server auth helpers |
| `NEXT_PUBLIC_CONVEX_SITE_URL` **(required)** | `https://<name>.convex.site`, the HTTP actions host that `/api/auth/*` proxies to |
| `CONVEX_DEPLOY_KEY` | Production builds only. Lets `npx convex deploy` push functions during the Vercel build. |

### Compiling

| Variable | Default | Purpose |
| --- | --- | --- |
| `CLEVEX_COMPILER` | `auto` | `auto` uses Tectonic if present, otherwise remote. `tectonic` uses Tectonic only. `remote` always uses the remote service. |
| `CLEVEX_LATEX_REMOTE_URL` | `https://latex.ytotech.com/builds/sync` | A [LaTeX-on-HTTP](https://github.com/YtoTech/latex-on-http)-compatible endpoint |
| `TECTONIC_BIN` | (auto-detected) | Full path to the `tectonic` binary |

### Server-side AI credentials

By default, every browser brings its own ChatGPT or Claude login and the server
holds no credentials. The options below let the server answer for users who
haven't connected a provider. Only signed-in users can reach the AI routes, but
**every account on the deployment shares these credentials**, so pair them with
`AUTH_ALLOWED_EMAILS`.

| Variable | Purpose |
| --- | --- |
| `CLAUDE_CODE_OAUTH_TOKEN` | A long-lived token from `claude setup-token`. Signed-in users without their own Claude login use your Claude plan. Running locally, it's also offered by "import from this computer". |

#### AI gateways

These point clevex at a self-hosted proxy that speaks the OpenAI Responses API or
the Anthropic Messages API, for example
[CLIProxyAPI](https://github.com/router-for-me/CLIProxyAPI), LiteLLM, or your
company's gateway. A browser login always takes priority over a gateway.

| Variable | Purpose |
| --- | --- |
| `CLEVEX_OPENAI_BASE_URL` | Base URL; clevex calls `${base}/responses` |
| `CLEVEX_OPENAI_API_KEY` | Sent as `Authorization: Bearer …` |
| `CLEVEX_ANTHROPIC_BASE_URL` | Base URL for the Anthropic SDK |
| `CLEVEX_ANTHROPIC_API_KEY` | Sent as the auth token |

### Local-only

| Variable | Purpose |
| --- | --- |
| `CODEX_HOME` | Where to find the Codex CLI's `auth.json` for "import from this computer" (default `~/.codex`) |

## Automatic behavior on Vercel

When `VERCEL` is set (Vercel sets it on every deployment), clevex treats each
request as non-local and turns off the following:

- **Import from this computer**, which reads `~/.codex/auth.json` and the Claude
  Code keychain entry
- **The ChatGPT callback catcher** on `localhost:1455`

`/api/config` tells the UI which of these options are available. It never
returns secrets.
