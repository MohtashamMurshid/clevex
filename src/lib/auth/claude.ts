"use client";

import { CLAUDE } from "./constants";
import { createPkce, randomString } from "./pkce";
import { getCredentials, setCredentials, type ClaudeCredential } from "./store";

const PENDING = "clevex.claude.pending";

export async function startClaudeLogin() {
  const { verifier, challenge } = await createPkce();
  const state = randomString(24);
  sessionStorage.setItem(PENDING, JSON.stringify({ verifier, state }));
  const url = new URL(CLAUDE.authorizeUrl);
  url.searchParams.set("code", "true");
  url.searchParams.set("client_id", CLAUDE.clientId);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("redirect_uri", CLAUDE.redirectUri);
  url.searchParams.set("scope", CLAUDE.scope);
  url.searchParams.set("code_challenge", challenge);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("state", state);
  return { url: url.toString(), state };
}

/** The Claude callback page shows `code#state`; accept that or a pasted callback URL. */
export function parseClaudeCode(input: string): { code: string; state?: string } | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  try {
    const u = new URL(trimmed);
    const code = u.searchParams.get("code");
    if (code) return { code, state: u.searchParams.get("state") ?? undefined };
  } catch {
    /* not a URL */
  }
  const [code, state] = trimmed.split("#");
  if (!code) return null;
  return { code, state };
}

export async function completeClaudeLogin(input: string) {
  const parsed = parseClaudeCode(input);
  if (!parsed) throw new Error("Paste the code shown after you approve access.");
  const pending = JSON.parse(sessionStorage.getItem(PENDING) || "null") as {
    verifier: string;
    state: string;
  } | null;
  if (!pending) throw new Error("Start the sign-in again — the login session expired.");
  if (parsed.state && parsed.state !== pending.state) {
    throw new Error("That code belongs to a different sign-in attempt. Start again.");
  }
  const res = await fetch("/api/providers/claude/token", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      grant: "authorization_code",
      code: parsed.code,
      state: parsed.state ?? pending.state,
      verifier: pending.verifier,
    }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error || "Token exchange failed");
  const cred: ClaudeCredential = {
    kind: "claude-oauth",
    accessToken: body.access_token,
    refreshToken: body.refresh_token,
    expiresAt: body.expires_in ? Date.now() + body.expires_in * 1000 : undefined,
    email: body.account?.email_address,
    plan: body.organization?.organization_type ?? body.subscription_type,
    source: "oauth",
  };
  setCredentials((c) => ({ ...c, claude: cred }));
  sessionStorage.removeItem(PENDING);
  return cred;
}

/** Paste a token from `claude setup-token` (sk-ant-oat…) or an API key (sk-ant-api…). */
export function saveClaudeToken(raw: string) {
  const token = raw.trim();
  if (token.startsWith("sk-ant-api")) {
    setCredentials((c) => ({ ...c, claude: { kind: "anthropic-key", apiKey: token, source: "key" } }));
    return;
  }
  if (!token.startsWith("sk-ant-oat")) {
    throw new Error("Expected a token that starts with sk-ant-oat… (from `claude setup-token`) or an API key (sk-ant-api…).");
  }
  setCredentials((c) => ({
    ...c,
    claude: { kind: "claude-oauth", accessToken: token, source: "setup-token" },
  }));
}

/** Import Claude Code's stored OAuth credentials (`claudeAiOauth` blob). */
export function importClaudeCredentials(json: string) {
  let parsed: { claudeAiOauth?: { accessToken?: string; refreshToken?: string; expiresAt?: number; subscriptionType?: string } };
  try {
    parsed = JSON.parse(json);
  } catch {
    // Allow a bare token too.
    saveClaudeToken(json);
    return;
  }
  const o = parsed.claudeAiOauth;
  if (!o?.accessToken) throw new Error("No claudeAiOauth credentials in that JSON.");
  setCredentials((c) => ({
    ...c,
    claude: {
      kind: "claude-oauth",
      accessToken: o.accessToken!,
      refreshToken: o.refreshToken,
      expiresAt: o.expiresAt,
      plan: o.subscriptionType,
      source: "import",
    },
  }));
}

let refreshing: Promise<ClaudeCredential> | null = null;

export async function ensureClaude(): Promise<ClaudeCredential> {
  const cred = getCredentials().claude;
  if (!cred) throw new Error("Connect Claude first.");
  if (cred.kind === "anthropic-key") return cred;
  const soon = Date.now() + 2 * 60 * 1000;
  if (!cred.expiresAt || cred.expiresAt > soon) return cred;
  if (!cred.refreshToken) throw new Error("Your Claude session expired. Sign in again.");
  if (cred.source === "import") {
    throw new Error(
      "The imported Claude Code session expired. Open Claude Code once to refresh it and import again, or sign in from clevex.",
    );
  }
  refreshing ??= (async () => {
    try {
      const res = await fetch("/api/providers/claude/token", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ grant: "refresh_token", refreshToken: cred.refreshToken }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Could not refresh Claude session. Sign in again.");
      const next: ClaudeCredential = {
        ...cred,
        accessToken: body.access_token,
        refreshToken: body.refresh_token ?? cred.refreshToken,
        expiresAt: body.expires_in ? Date.now() + body.expires_in * 1000 : undefined,
      };
      setCredentials((c) => ({ ...c, claude: next }));
      return next;
    } finally {
      refreshing = null;
    }
  })();
  return refreshing;
}
