import http from "node:http";
import { isLocalRequest } from "@/lib/server/env";

export const runtime = "nodejs";

/**
 * When clevex runs locally, catch the ChatGPT OAuth redirect on
 * http://localhost:1455/auth/callback (the only redirect the Codex client
 * allows) so sign-in completes without copy-pasting the URL.
 */

type Listener = { server: http.Server; captured: Map<string, string>; closeTimer?: NodeJS.Timeout };
const g = globalThis as unknown as { __clevexCallback?: Listener };

const PAGE = `<!doctype html><html><head><meta charset="utf-8"><title>clevex — signed in</title>
<style>body{margin:0;height:100vh;display:grid;place-items:center;background:#f6f5f3;font:15px/1.5 ui-sans-serif,system-ui;color:#191715}
.c{text-align:center}.b{width:56px;height:48px;margin:0 auto 16px}</style></head>
<body><div class="c"><svg class="b" viewBox="0 0 439 374"><path d="M219 .4C181.6.4 138.8 46.9 138.8 46.9S130.1 35.9 106.5 36.2C82.8 36.5 38.3 72 20.9 113.9 3.4 155.9.6 182 .6 207.9c0 25.9 8.7 98 63.1 128.1 54.3 30.1 110.1 37.2 154.8 37.2s107-7.6 160.8-37.2c53.7-29.5 59.7-92 59.7-128.1 0-36-8.2-60.5-22-94C403.2 80.4 358.4 36.2 335.9 36.5c-22.5.3-35.5 10.4-35.5 10.4S256.5.4 219 .4Z" fill="#FBC627"/><ellipse cx="89.6" cy="176.1" rx="64.2" ry="83.3" fill="#fff"/><ellipse cx="349.7" cy="176.1" rx="64.2" ry="83.3" fill="#fff"/><ellipse cx="95.9" cy="175.8" rx="43.6" ry="53.4"/><ellipse cx="342.1" cy="176.1" rx="43.6" ry="53.4"/></svg>
<b>You're signed in to ChatGPT.</b><br>You can close this tab and go back to clevex.</div></body></html>`;

function ensureListener(): Promise<Listener> {
  if (g.__clevexCallback) return Promise.resolve(g.__clevexCallback);
  return new Promise((resolve, reject) => {
    const captured = new Map<string, string>();
    const server = http.createServer((req, res) => {
      const url = new URL(req.url || "/", "http://localhost:1455");
      if (url.pathname === "/auth/callback") {
        const code = url.searchParams.get("code");
        const state = url.searchParams.get("state");
        if (code && state) captured.set(state, code);
        res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
        res.end(PAGE);
        return;
      }
      res.writeHead(404).end();
    });
    server.once("error", reject);
    server.listen(1455, "127.0.0.1", () => {
      const l: Listener = { server, captured };
      g.__clevexCallback = l;
      resolve(l);
    });
  });
}

function scheduleClose(l: Listener) {
  if (l.closeTimer) clearTimeout(l.closeTimer);
  l.closeTimer = setTimeout(() => {
    l.server.close();
    g.__clevexCallback = undefined;
  }, 10 * 60 * 1000);
}

export async function POST(req: Request) {
  if (!isLocalRequest(req) || req.headers.get("x-clevex") !== "1") {
    return Response.json({ ok: false, reason: "not-local" });
  }
  try {
    const l = await ensureListener();
    scheduleClose(l);
    return Response.json({ ok: true });
  } catch (err) {
    const busy = (err as NodeJS.ErrnoException).code === "EADDRINUSE";
    return Response.json({ ok: false, reason: busy ? "port-busy" : String(err) });
  }
}

export async function GET(req: Request) {
  if (!isLocalRequest(req) || req.headers.get("x-clevex") !== "1") {
    return Response.json({ code: null });
  }
  const state = new URL(req.url).searchParams.get("state") || "";
  const l = g.__clevexCallback;
  const code = l?.captured.get(state) ?? null;
  if (code && l) {
    l.captured.delete(state);
    l.server.close();
    g.__clevexCallback = undefined;
  }
  return Response.json({ code });
}
