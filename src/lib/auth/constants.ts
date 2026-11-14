/**
 * OAuth parameters for "Sign in with ChatGPT" (the public Codex CLI client)
 * and "Sign in with Claude" (the public Claude Code client).
 *
 * ChatGPT: https://github.com/openai/codex — codex-rs/login (issuer, client id,
 *   PKCE S256, fixed redirect to localhost:1455, extra authorize params).
 * Claude:  Claude Code CLI OAuth config (authorize/token endpoints, manual
 *   redirect that shows a code to paste back).
 */

export const CHATGPT = {
  issuer: "https://auth.openai.com",
  authorizeUrl: "https://auth.openai.com/oauth/authorize",
  tokenUrl: "https://auth.openai.com/oauth/token",
  clientId: "app_EMoamEEZ73f0CkXaXp7hrann",
  redirectUri: "http://localhost:1455/auth/callback",
  scope: "openid profile email offline_access",
  apiBase: "https://chatgpt.com/backend-api/codex",
  originator: "codex_cli_rs",
} as const;

export const CLAUDE = {
  authorizeUrl: "https://claude.com/cai/oauth/authorize",
  tokenUrl: "https://platform.claude.com/v1/oauth/token",
  clientId: "9d1c250a-e61b-44d9-88ed-5944d1962f5e",
  redirectUri: "https://platform.claude.com/oauth/code/callback",
  /** Inference-only, long-lived token — the same shape `claude setup-token` creates. */
  scope: "user:inference",
  longLivedSeconds: 365 * 24 * 60 * 60,
  apiBase: "https://api.anthropic.com",
  oauthBeta: "oauth-2025-04-20",
  identity: "You are Claude Code, Anthropic's official CLI for Claude.",
} as const;
