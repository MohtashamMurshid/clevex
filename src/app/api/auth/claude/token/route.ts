import { CLAUDE } from "@/lib/auth/constants";

export const runtime = "nodejs";

async function post(payload: Record<string, unknown>) {
  return fetch(CLAUDE.tokenUrl, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify(payload),
  });
}

/** Stateless proxy for the Claude OAuth token endpoint. */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    grant?: string;
    code?: string;
    state?: string;
    verifier?: string;
    refreshToken?: string;
  };

  let upstream: Response;
  if (body.grant === "authorization_code" && body.code && body.verifier) {
    const payload: Record<string, unknown> = {
      grant_type: "authorization_code",
      code: body.code,
      state: body.state,
      redirect_uri: CLAUDE.redirectUri,
      client_id: CLAUDE.clientId,
      code_verifier: body.verifier,
      expires_in: CLAUDE.longLivedSeconds,
    };
    upstream = await post(payload);
    if (upstream.status === 400) {
      // Some accounts can't mint long-lived tokens; retry with the default lifetime.
      const retryText = await upstream.clone().text();
      if (/expires_in/i.test(retryText)) {
        delete payload.expires_in;
        upstream = await post(payload);
      }
    }
  } else if (body.grant === "refresh_token" && body.refreshToken) {
    upstream = await post({
      grant_type: "refresh_token",
      refresh_token: body.refreshToken,
      client_id: CLAUDE.clientId,
    });
  } else {
    return Response.json({ error: "Bad request" }, { status: 400 });
  }

  const text = await upstream.text();
  let json: Record<string, unknown> = {};
  try {
    json = JSON.parse(text);
  } catch {
    /* ignore */
  }
  if (!upstream.ok) {
    const err = json.error as { message?: string } | string | undefined;
    const message =
      (typeof err === "string" ? (json.error_description as string) || err : err?.message) ||
      `Claude auth returned ${upstream.status}`;
    return Response.json({ error: message }, { status: upstream.status });
  }
  return Response.json(json);
}
