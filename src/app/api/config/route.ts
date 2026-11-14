import { isLocalRequest, serverEnv } from "@/lib/server/env";

export const runtime = "nodejs";

/** Tells the UI which server-side options exist (never returns secrets). */
export async function GET(req: Request) {
  return Response.json({
    local: isLocalRequest(req),
    serverClaude: !!serverEnv.claudeToken || !!serverEnv.anthropicGateway,
    serverChatGPT: !!serverEnv.openaiGateway,
    onVercel: serverEnv.onVercel,
  });
}
