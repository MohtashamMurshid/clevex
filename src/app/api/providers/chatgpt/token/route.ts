import { CHATGPT } from "@/lib/auth/constants";

export const runtime = "nodejs";

/** Stateless proxy for the ChatGPT (Codex) OAuth token endpoint — browsers can't call it directly (CORS). */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    grant?: string;
    code?: string;
    verifier?: string;
    refreshToken?: string;
  };

  let upstream: Response;
  if (body.grant === "authorization_code" && body.code && body.verifier) {
    upstream = await fetch(CHATGPT.tokenUrl, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code: body.code,
        redirect_uri: CHATGPT.redirectUri,
        client_id: CHATGPT.clientId,
        code_verifier: body.verifier,
      }),
    });
  } else if (body.grant === "refresh_token" && body.refreshToken) {
    upstream = await fetch(CHATGPT.tokenUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        client_id: CHATGPT.clientId,
        grant_type: "refresh_token",
        refresh_token: body.refreshToken,
        scope: "openid profile email",
      }),
    });
  } else {
    return Response.json({ error: "Bad request" }, { status: 400 });
  }

  const text = await upstream.text();
  let json: Record<string, unknown> = {};
  try {
    json = JSON.parse(text);
  } catch {
    /* non-JSON error page */
  }
  if (!upstream.ok) {
    const err = json.error as { message?: string } | string | undefined;
    const message =
      (typeof err === "string" ? (json.error_description as string) || err : err?.message) ||
      `OpenAI auth returned ${upstream.status}`;
    return Response.json({ error: message }, { status: upstream.status });
  }
  return Response.json(json);
}
