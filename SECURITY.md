# Security policy

## Reporting a vulnerability

**Don't open a public issue for security problems.** Report them privately with
GitHub's [private vulnerability reporting](../../security/advisories/new) (the
**Security → Report a vulnerability** tab on this repo).

Include:

- what the issue is and what an attacker could do with it
- steps or a proof of concept to reproduce it
- the commit or deployment you tested against

You'll get an acknowledgement within a few days. Please give us reasonable time
to fix the issue before you disclose it publicly. We'll credit you in the
advisory unless you'd rather we didn't.

## Supported versions

clevex is developed on `main`, and security fixes land there. There are no
long-term support branches.

## Security model

Things worth knowing when you assess a report:

| Area | Design |
| --- | --- |
| **Provider credentials** | ChatGPT and Claude tokens are stored only in the browser's `localStorage`. They're sent with each AI request, forwarded to OpenAI or Anthropic, and never logged or saved on the server. Because of this, an XSS bug would be high severity. |
| **Accounts** | Better Auth on Convex with email and password and HTTP-only session cookies. `BETTER_AUTH_SECRET` is set per deployment. `AUTH_ALLOWED_EMAILS` can close sign-ups. |
| **Authorization** | Every Convex query and mutation checks that the caller owns the project, file or thread. `src/proxy.ts` is only an optimistic first check. |
| **Local-only routes** | `/api/local/*` reads the Codex CLI and Claude Code logins on the host. These routes are disabled when `VERCEL` is set or when `Host` isn't localhost, and they require an `x-clevex: 1` header so that cross-site pages can't call them without a CORS preflight. |
| **Compile** | Uploaded paths are checked against an allowlist (no absolute paths, no `..`). Tectonic runs in a throwaway temp directory with a timeout. Remote compiles send project files to `CLEVEX_LATEX_REMOTE_URL`. |
| **Server-side tokens** | `CLAUDE_CODE_OAUTH_TOKEN` and the gateway keys are shared by every signed-in user. That's intentional and documented, not a vulnerability. |

### In scope

- Getting another user's projects, files, threads or session
- Getting a user's provider token out of the browser or server
- Reaching `/api/local/*` on a non-local deployment
- Path traversal or code execution through `/api/compile`
- XSS in the chat Markdown, edit cards, PDF viewer or file names

### Out of scope

- Provider terms-of-service questions about using subscription OAuth tokens
  (see the README)
- Missing rate limits on a self-hosted deployment
- Attacks that need a malicious LaTeX package already installed on the
  compiling host
