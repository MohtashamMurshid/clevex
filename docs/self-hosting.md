# Self-hosting

clevex runs as a Next.js app on [Vercel](https://vercel.com) or any Node host,
with a [Convex](https://convex.dev) backend. These steps set up a production
deployment on Vercel with separate dev and prod Convex deployments.

## Overview

```
Browser ──► Next.js (Vercel)
              ├─ /api/auth/*        ─► Convex HTTP actions (Better Auth)
              ├─ /api/ai/*          ─► ChatGPT / Claude, with the user's own token
              ├─ /api/compile       ─► Tectonic (if installed) or LaTeX-on-HTTP
              └─ /api/arxiv         ─► arXiv API
Browser ──► Convex (queries and mutations over WebSocket: projects, files, threads)
```

| Environment | Convex deployment | Next.js |
| --- | --- | --- |
| Local | your **dev** deployment | `pnpm dev` |
| Vercel Preview | your **dev** deployment | preview builds |
| Vercel Production | your **prod** deployment | production build, which also deploys Convex functions |

## 1. Fork and import into Vercel

1. Fork this repo.
2. In Vercel, choose **Add New → Project** and import your fork. The framework
   preset is Next.js. You don't need to change the build command, because
   `vercel.json` sets it:

   ```sh
   if [ "$VERCEL_ENV" = "production" ]; then npx convex deploy --cmd 'pnpm build'; else pnpm build; fi
   ```

   Production builds push the `convex/` functions to your prod deployment and then
   build Next.js. Preview builds only build Next.js.

## 2. Set up the Convex production deployment

Your Convex project already has a dev deployment from
[Getting started](getting-started.md). Configure prod from your machine:

```bash
npx convex env set --prod SITE_URL https://your-app.vercel.app
npx convex env set --prod BETTER_AUTH_SECRET "$(openssl rand -base64 32)"
# Optional: other origins that should be able to sign in
npx convex env set --prod TRUSTED_ORIGINS https://your-custom-domain.com
# Optional but recommended: close sign-ups to just you
npx convex env set --prod AUTH_ALLOWED_EMAILS you@example.com
```

In the Convex dashboard, open **your project → Settings → Deploy keys** and
generate a **production deploy key**.

## 3. Vercel environment variables

| Variable | Production | Preview |
| --- | --- | --- |
| `CONVEX_DEPLOY_KEY` | the prod deploy key | not set |
| `NEXT_PUBLIC_CONVEX_URL` | `https://<prod>.convex.cloud` | `https://<dev>.convex.cloud` |
| `NEXT_PUBLIC_CONVEX_SITE_URL` | `https://<prod>.convex.site` | `https://<dev>.convex.site` |

For preview deployments to sign in against the dev deployment, add their origins
to the dev deployment's `TRUSTED_ORIGINS`. Otherwise, use previews only for UI
checks.

The optional variables in [Configuration](configuration.md) also work here, such
as `CLEVEX_LATEX_REMOTE_URL` and the AI gateways.

## 4. Deploy

Push to your default branch, or run `vercel deploy --prod`. Then open the site,
create your account, and connect ChatGPT or Claude. On a hosted site, ChatGPT
sign-in uses the paste-the-URL step described in
[providers.md](providers.md#chatgpt).

## Hosting without Vercel

clevex is a standard Next.js app:

```bash
pnpm build
npx convex deploy          # with CONVEX_DEPLOY_KEY set, or run it from a logged-in machine
pnpm start                 # PORT=3000 by default
```

If you install Tectonic on the server, you get fast, private compiles. Make sure
the server process can write to the system temp directory and to Tectonic's
cache (`~/.cache/Tectonic`).

The "import from this computer" options turn on only when the request's `Host`
is `localhost` or `127.0.0.1` and `VERCEL` isn't set. A public server never
exposes them.

## Hardening checklist

- [ ] Set `AUTH_ALLOWED_EMAILS` unless you want open sign-ups.
- [ ] Use a different `BETTER_AUTH_SECRET` for dev and prod.
- [ ] Don't set `CLAUDE_CODE_OAUTH_TOKEN` or the gateway keys on a deployment
      that other people can sign up to. Everyone would share them.
- [ ] Remember that with remote compiles, project files go to
      `CLEVEX_LATEX_REMOTE_URL`. Self-host it if your documents are sensitive.
- [ ] Replace the Cleve branding if you run a public fork (see
      [TRADEMARKS.md](../TRADEMARKS.md)).
