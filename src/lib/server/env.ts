/**
 * Server-side configuration. Everything is optional — by default clevex is a
 * stateless proxy and each browser brings its own ChatGPT / Claude login.
 *
 *  CLAUDE_CODE_OAUTH_TOKEN   Long-lived token from `claude setup-token`. Lets a
 *                            deployment use your Claude subscription without a
 *                            browser login. Set CLEVEX_PASSWORD with it.
 *  CLEVEX_OPENAI_BASE_URL    Optional OpenAI Responses-compatible gateway
 *  CLEVEX_OPENAI_API_KEY       (e.g. a self-hosted CLIProxyAPI) used when the
 *                            browser has no ChatGPT login.
 *  CLEVEX_ANTHROPIC_BASE_URL Optional Anthropic Messages-compatible gateway,
 *  CLEVEX_ANTHROPIC_API_KEY    same idea for Claude.
 *  CLEVEX_PASSWORD           Gate the whole app behind a password.
 *  CLEVEX_COMPILER           "auto" (default) | "tectonic" | "remote"
 *  CLEVEX_LATEX_REMOTE_URL   LaTeX-on-HTTP endpoint (default latex.ytotech.com).
 */
export const serverEnv = {
  claudeToken: process.env.CLAUDE_CODE_OAUTH_TOKEN?.trim() || undefined,
  openaiGateway: process.env.CLEVEX_OPENAI_BASE_URL?.trim().replace(/\/$/, "") || undefined,
  openaiGatewayKey: process.env.CLEVEX_OPENAI_API_KEY?.trim() || undefined,
  anthropicGateway: process.env.CLEVEX_ANTHROPIC_BASE_URL?.trim().replace(/\/$/, "") || undefined,
  anthropicGatewayKey: process.env.CLEVEX_ANTHROPIC_API_KEY?.trim() || undefined,
  password: process.env.CLEVEX_PASSWORD || undefined,
  compiler: (process.env.CLEVEX_COMPILER || "auto") as "auto" | "tectonic" | "remote",
  latexRemote: process.env.CLEVEX_LATEX_REMOTE_URL || "https://latex.ytotech.com/builds/sync",
  onVercel: !!process.env.VERCEL,
};

export function isLocalRequest(req: Request) {
  if (serverEnv.onVercel) return false;
  const host = (req.headers.get("host") || "").split(":")[0];
  return host === "localhost" || host === "127.0.0.1" || host === "[::1]";
}
