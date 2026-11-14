import { CHATGPT } from "@/lib/auth/constants";
import type { WireRequest } from "@/lib/ai/wire";
import { serverEnv } from "@/lib/server/env";
import { readSSE, sseResponse, type StreamEvent } from "@/lib/server/sse";

export const runtime = "nodejs";
export const maxDuration = 300;

type Target = { url: string; headers: Record<string, string>; codex: boolean };

function resolveTarget(body: WireRequest): Target | null {
  const auth = body.auth;
  if (auth?.kind === "chatgpt-oauth") {
    const headers: Record<string, string> = {
      authorization: `Bearer ${auth.accessToken}`,
      "openai-beta": "responses=experimental",
      originator: CHATGPT.originator,
      session_id: body.sessionId || crypto.randomUUID(),
      accept: "text/event-stream",
      "content-type": "application/json",
    };
    if (auth.accountId) headers["chatgpt-account-id"] = auth.accountId;
    return { url: `${CHATGPT.apiBase}/responses`, headers, codex: true };
  }
  if (serverEnv.openaiGateway) {
    return {
      url: `${serverEnv.openaiGateway}/responses`,
      headers: {
        authorization: `Bearer ${serverEnv.openaiGatewayKey ?? "clevex"}`,
        accept: "text/event-stream",
        "content-type": "application/json",
      },
      codex: false,
    };
  }
  return null;
}

function buildInput(body: WireRequest, systemAsDeveloper: boolean) {
  const input: unknown[] = [];
  if (systemAsDeveloper) {
    input.push({ type: "message", role: "developer", content: [{ type: "input_text", text: body.system }] });
  }
  if (body.context) {
    input.push({ type: "message", role: "developer", content: [{ type: "input_text", text: body.context }] });
  }
  for (const m of body.messages) {
    if (m.role === "user") {
      const content: unknown[] = [];
      for (const img of m.images ?? []) {
        content.push({ type: "input_image", image_url: `data:${img.mime};base64,${img.data}` });
      }
      content.push({ type: "input_text", text: m.text });
      input.push({ type: "message", role: "user", content });
    } else {
      input.push({ type: "message", role: "assistant", content: [{ type: "output_text", text: m.text }] });
    }
  }
  return input;
}

export async function POST(req: Request) {
  const body = (await req.json()) as WireRequest;
  const target = resolveTarget(body);
  if (!target) {
    return Response.json({ error: "Connect ChatGPT first." }, { status: 401 });
  }

  return sseResponse(async (emit, signal) => {
    const send = async (systemAsDeveloper: boolean) => {
      const payload: Record<string, unknown> = {
        model: body.model,
        instructions: systemAsDeveloper ? "You are a helpful assistant." : body.system,
        input: buildInput(body, systemAsDeveloper),
        stream: true,
        store: false,
        reasoning: { effort: body.effort ?? "medium", summary: "auto" },
      };
      if (target.codex) {
        payload.include = ["reasoning.encrypted_content"];
        payload.text = { verbosity: "medium" };
        payload.tool_choice = "auto";
        payload.parallel_tool_calls = false;
        payload.tools = [];
        if (body.sessionId) payload.prompt_cache_key = body.sessionId;
      }
      return fetch(target.url, {
        method: "POST",
        headers: target.headers,
        body: JSON.stringify(payload),
        signal,
      });
    };

    let res = await send(false);
    if (res.status === 400) {
      const text = await res.clone().text();
      if (/instruction/i.test(text)) res = await send(true);
    }
    if (!res.ok || !res.body) {
      const text = await res.text().catch(() => "");
      emit({ type: "error", message: describeError(res.status, text), status: res.status });
      return;
    }

    let usage: StreamEvent & { type: "done" } = { type: "done", model: body.model };
    for await (const { event, data } of readSSE(res.body)) {
      if (data === "[DONE]") break;
      let ev: Record<string, unknown>;
      try {
        ev = JSON.parse(data);
      } catch {
        continue;
      }
      const type = (ev.type as string) || event;
      switch (type) {
        case "response.output_text.delta":
          emit({ type: "text", text: String(ev.delta ?? "") });
          break;
        case "response.reasoning_summary_text.delta":
        case "response.reasoning_text.delta":
          emit({ type: "thinking", text: String(ev.delta ?? "") });
          break;
        case "response.reasoning_summary_part.added":
          emit({ type: "thinking", text: "\n\n" });
          break;
        case "response.completed": {
          const u = (ev.response as { usage?: { input_tokens?: number; output_tokens?: number } })?.usage;
          usage = { type: "done", model: body.model, usage: { input: u?.input_tokens, output: u?.output_tokens } };
          break;
        }
        case "response.failed":
        case "response.incomplete": {
          const r = ev.response as { error?: { message?: string }; incomplete_details?: { reason?: string } };
          emit({
            type: "error",
            message: r?.error?.message || `Response ${type.split(".")[1]}: ${r?.incomplete_details?.reason ?? "unknown"}`,
          });
          break;
        }
        case "error":
          emit({ type: "error", message: String((ev as { message?: string }).message ?? "ChatGPT error") });
          break;
      }
    }
    emit(usage);
  }, req.signal);
}

function describeError(status: number, text: string) {
  let msg = text;
  try {
    const j = JSON.parse(text);
    msg = j.detail?.message || j.detail || j.error?.message || j.message || text;
  } catch {
    /* keep raw */
  }
  if (status === 401) return "ChatGPT rejected the session (401). Sign in again.";
  if (status === 429) return `ChatGPT usage limit reached. ${typeof msg === "string" ? msg : ""}`.trim();
  if (status === 404 || /model/i.test(String(msg))) return `ChatGPT: ${msg || "model not available on your plan"}`;
  return `ChatGPT error ${status}: ${String(msg).slice(0, 400)}`;
}
