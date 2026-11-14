import Anthropic from "@anthropic-ai/sdk";
import type { BetaMessageParam, MessageCreateParamsStreaming } from "@anthropic-ai/sdk/resources/beta/messages/messages";
import { CLAUDE } from "@/lib/auth/constants";
import type { WireRequest } from "@/lib/ai/wire";
import { serverEnv } from "@/lib/server/env";
import { errorMessage, sseResponse } from "@/lib/server/sse";

export const runtime = "nodejs";
export const maxDuration = 300;

type Resolved = { client: Anthropic; subscription: boolean };

function resolveClient(body: WireRequest): Resolved | null {
  const auth = body.auth;
  // Always pass baseURL and a credential explicitly so the SDK never falls back
  // to ANTHROPIC_* environment variables or profiles on the host machine.
  if (auth?.kind === "claude-oauth") {
    return { client: new Anthropic({ authToken: auth.accessToken, baseURL: CLAUDE.apiBase }), subscription: true };
  }
  if (auth?.kind === "anthropic-key") {
    return { client: new Anthropic({ apiKey: auth.apiKey, baseURL: CLAUDE.apiBase }), subscription: false };
  }
  if (serverEnv.claudeToken) {
    return { client: new Anthropic({ authToken: serverEnv.claudeToken, baseURL: CLAUDE.apiBase }), subscription: true };
  }
  if (serverEnv.anthropicGateway) {
    return {
      client: new Anthropic({ authToken: serverEnv.anthropicGatewayKey ?? "clevex", baseURL: serverEnv.anthropicGateway }),
      subscription: false,
    };
  }
  return null;
}

function supportsFallbacks(model: string) {
  return /^claude-(opus-5|sonnet-5-5|fable-5)/.test(model);
}

export async function POST(req: Request) {
  const body = (await req.json()) as WireRequest;
  const resolved = resolveClient(body);
  if (!resolved) return Response.json({ error: "Connect Claude first." }, { status: 401 });
  const { client, subscription } = resolved;

  const system: { type: "text"; text: string; cache_control?: { type: "ephemeral" } }[] = [];
  if (subscription) system.push({ type: "text", text: CLAUDE.identity });
  system.push({ type: "text", text: body.system });
  if (body.context) system.push({ type: "text", text: body.context, cache_control: { type: "ephemeral" } });

  const messages: BetaMessageParam[] = body.messages.map((m) =>
    m.role === "user"
      ? {
          role: "user",
          content: [
            ...(m.images ?? []).map((img) => ({
              type: "image" as const,
              source: {
                type: "base64" as const,
                media_type: img.mime as "image/png" | "image/jpeg" | "image/gif" | "image/webp",
                data: img.data,
              },
            })),
            { type: "text" as const, text: m.text || "(image)" },
          ],
        }
      : { role: "assistant", content: m.text || "…" },
  );

  return sseResponse(async (emit, signal) => {
    const betas: string[] = [];
    if (subscription) betas.push(CLAUDE.oauthBeta, "claude-code-20250219");

    const base: MessageCreateParamsStreaming = {
      model: body.model,
      max_tokens: 32000,
      system,
      messages,
      stream: true,
      thinking: { type: "adaptive", display: "summarized" },
      output_config: { effort: body.effort ?? "medium" },
    };

    const attempt = async (withFallbacks: boolean) => {
      const params: MessageCreateParamsStreaming = { ...base };
      const b = [...betas];
      if (withFallbacks) {
        params.fallbacks = "default";
        b.push("server-side-fallback-2026-07-01");
      }
      if (b.length) params.betas = b;
      return client.beta.messages.create(params, { signal });
    };

    let stream;
    try {
      stream = await attempt(supportsFallbacks(body.model));
    } catch (err) {
      if (err instanceof Anthropic.BadRequestError && /fallback|beta/i.test(err.message)) {
        stream = await attempt(false);
      } else {
        throw describe(err);
      }
    }

    let input: number | undefined;
    let output: number | undefined;
    let model = body.model;
    try {
      for await (const ev of stream) {
        switch (ev.type) {
          case "message_start":
            input = ev.message.usage?.input_tokens;
            model = ev.message.model || model;
            break;
          case "content_block_delta":
            if (ev.delta.type === "text_delta") emit({ type: "text", text: ev.delta.text });
            else if (ev.delta.type === "thinking_delta") emit({ type: "thinking", text: ev.delta.thinking });
            break;
          case "content_block_start":
            if (ev.content_block.type === "thinking") emit({ type: "thinking", text: "\n\n" });
            break;
          case "message_delta":
            output = ev.usage?.output_tokens ?? output;
            if (ev.delta.stop_reason === "refusal") {
              emit({ type: "error", message: "Claude declined this request." });
            } else if (ev.delta.stop_reason === "max_tokens") {
              emit({ type: "status", text: "Reply hit the length limit." });
            }
            break;
        }
      }
    } catch (err) {
      throw describe(err);
    }
    emit({ type: "done", model, usage: { input, output } });
  }, req.signal);
}

function describe(err: unknown): Error {
  if (err instanceof Anthropic.AuthenticationError) {
    return new Error("Claude rejected the credential (401). Sign in again or paste a fresh token.");
  }
  if (err instanceof Anthropic.PermissionDeniedError) {
    return new Error(`Claude refused access (403): ${err.message}`);
  }
  if (err instanceof Anthropic.RateLimitError) {
    return new Error("Claude usage limit reached for now. Try again later or switch model.");
  }
  if (err instanceof Anthropic.NotFoundError) {
    return new Error(`Claude model not found: ${err.message}`);
  }
  if (err instanceof Anthropic.APIError) {
    return new Error(`Claude error ${err.status ?? ""}: ${err.message}`.trim());
  }
  return new Error(errorMessage(err));
}
