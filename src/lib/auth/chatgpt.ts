"use client";

import { CHATGPT } from "./constants";
import { createPkce, randomString } from "./pkce";
import { decodeJwt, getCredentials, setCredentials, type ChatGPTCredential } from "./store";

const PENDING = "clevex.chatgpt.pending";

type TokenResponse = {
  access_token: string;
  refresh_token?: string;
  id_token?: string;
  expires_in?: number;
};

export async function startChatGPTLogin() {
  const { verifier, challenge } = await createPkce();
  const state = randomString(24);
  sessionStorage.setItem(PENDING, JSON.stringify({ verifier, state }));
  const url = new URL(CHATGPT.authorizeUrl);
  const params: Record<string, string> = {
    response_type: "code",
    client_id: CHATGPT.clientId,
    redirect_uri: CHATGPT.redirectUri,
    scope: CHATGPT.scope,
    code_challenge: challenge,
    code_challenge_method: "S256",
    id_token_add_organizations: "true",
    codex_cli_simplified_flow: "true",
    originator: CHATGPT.originator,
    state,
  };
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return { url: url.toString(), state };
}

/** Accepts the full redirect URL (http://localhost:1455/auth/callback?code=…&state=…) or a bare code. */
export function parseChatGPTCallback(input: string): { code: string; state?: string } | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  try {
    const u = new URL(trimmed);
    const code = u.searchParams.get("code");
    if (code) return { code, state: u.searchParams.get("state") ?? undefined };
  } catch {
    /* not a URL */
  }
  const m = trimmed.match(/[?&]code=([^&\s]+)/);
  if (m) {
    const s = trimmed.match(/[?&]state=([^&\s]+)/);
    return { code: decodeURIComponent(m[1]), state: s ? decodeURIComponent(s[1]) : undefined };
  }
  if (/^[\w.\-~]+$/.test(trimmed)) return { code: trimmed };
  return null;
}

function credentialFromTokens(t: TokenResponse, source: ChatGPTCredential["source"]): ChatGPTCredential {
  const id = t.id_token ? decodeJwt(t.id_token) : null;
  const access = decodeJwt(t.access_token);
  const authClaims = ((id?.["https://api.openai.com/auth"] ??
    access?.["https://api.openai.com/auth"]) || {}) as Record<string, unknown>;
  const profile = (access?.["https://api.openai.com/profile"] || {}) as Record<string, unknown>;
  const exp = typeof access?.exp === "number" ? access.exp * 1000 : undefined;
  return {
    kind: "chatgpt-oauth",
    accessToken: t.access_token,
    refreshToken: t.refresh_token,
    idToken: t.id_token,
    accountId: (authClaims.chatgpt_account_id as string) || undefined,
    plan: (authClaims.chatgpt_plan_type as string) || undefined,
    email: ((id?.email as string) || (profile.email as string)) ?? undefined,
    expiresAt: exp ?? (t.expires_in ? Date.now() + t.expires_in * 1000 : undefined),
    source,
  };
}

export async function completeChatGPTLogin(input: string) {
  const parsed = parseChatGPTCallback(input);
  if (!parsed) throw new Error("Paste the full URL from the address bar after signing in.");
  const pending = JSON.parse(sessionStorage.getItem(PENDING) || "null") as {
    verifier: string;
    state: string;
  } | null;
  if (!pending) throw new Error("Start the sign-in again — the login session expired.");
  if (parsed.state && parsed.state !== pending.state) {
    throw new Error("That link belongs to a different sign-in attempt. Start again.");
  }
  const res = await fetch("/api/providers/chatgpt/token", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ grant: "authorization_code", code: parsed.code, verifier: pending.verifier }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error || "Token exchange failed");
  const cred = credentialFromTokens(body as TokenResponse, "oauth");
  setCredentials((c) => ({ ...c, chatgpt: cred }));
  sessionStorage.removeItem(PENDING);
  return cred;
}

/** Import `~/.codex/auth.json` (written by `codex login`). */
export function importCodexAuth(json: string) {
  let parsed: { tokens?: { access_token?: string; refresh_token?: string; id_token?: string; account_id?: string } };
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error("That isn't valid JSON. Paste the whole contents of ~/.codex/auth.json.");
  }
  const t = parsed.tokens;
  if (!t?.access_token) {
    throw new Error("No ChatGPT tokens found. Run `codex login` and choose “Sign in with ChatGPT” first.");
  }
  const cred = credentialFromTokens(
    { access_token: t.access_token, refresh_token: t.refresh_token, id_token: t.id_token },
    "import",
  );
  if (!cred.accountId && t.account_id) cred.accountId = t.account_id;
  setCredentials((c) => ({ ...c, chatgpt: cred }));
  return cred;
}

let refreshing: Promise<ChatGPTCredential> | null = null;

/** Returns a usable ChatGPT credential, refreshing it if it is about to expire. */
export async function ensureChatGPT(): Promise<ChatGPTCredential> {
  const cred = getCredentials().chatgpt;
  if (!cred) throw new Error("Connect ChatGPT first.");
  const soon = Date.now() + 2 * 60 * 1000;
  if (!cred.expiresAt || cred.expiresAt > soon) return cred;
  if (!cred.refreshToken) throw new Error("Your ChatGPT session expired. Sign in again.");
  if (cred.source === "import") {
    // Refreshing would rotate the Codex CLI's refresh token and sign the CLI out.
    throw new Error(
      "The imported Codex session expired. Run any `codex` command to refresh it and import again, or use Sign in with ChatGPT.",
    );
  }
  refreshing ??= (async () => {
    try {
      const res = await fetch("/api/providers/chatgpt/token", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ grant: "refresh_token", refreshToken: cred.refreshToken }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Could not refresh ChatGPT session. Sign in again.");
      const next = credentialFromTokens(
        { ...body, refresh_token: body.refresh_token ?? cred.refreshToken, id_token: body.id_token ?? cred.idToken },
        "oauth",
      );
      setCredentials((c) => ({ ...c, chatgpt: next }));
      return next;
    } finally {
      refreshing = null;
    }
  })();
  return refreshing;
}
