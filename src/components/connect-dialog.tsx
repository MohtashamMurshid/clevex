"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, Check, ChevronDown, Laptop, LogOut, ShieldCheck, TriangleAlert } from "lucide-react";
import { ProviderGlyph } from "@/components/brand";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogDescription,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsPanel, TabsTab } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { toastManager } from "@/components/ui/toast";
import { completeChatGPTLogin, importCodexAuth, startChatGPTLogin } from "@/lib/auth/chatgpt";
import { completeClaudeLogin, importClaudeCredentials, saveClaudeToken, startClaudeLogin } from "@/lib/auth/claude";
import { setCredentials, useCredentials } from "@/lib/auth/store";
import { useServerConfig } from "@/lib/server-config";
import type { ProviderId } from "@/lib/types";
import { cn } from "@/lib/utils";

export function ConnectDialog({
  open,
  onOpenChange,
  initial = "chatgpt",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial?: ProviderId;
}) {
  const [tab, setTab] = useState<ProviderId>(initial);
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setTab(initial);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPopup className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Connect your AI subscriptions</DialogTitle>
          <DialogDescription>
            clevex runs on the ChatGPT and Claude plans you already pay for. Tokens stay in this browser and are sent
            only to OpenAI or Anthropic through clevex&apos;s stateless proxy.
          </DialogDescription>
        </DialogHeader>
        <DialogPanel>
          <Tabs value={tab} onValueChange={(v) => setTab(v as ProviderId)}>
            <TabsList className="w-full">
              <TabsTab value="chatgpt" className="flex-1">
                <ProviderGlyph provider="chatgpt" /> ChatGPT
              </TabsTab>
              <TabsTab value="claude" className="flex-1">
                <ProviderGlyph provider="claude" /> Claude
              </TabsTab>
            </TabsList>
            <TabsPanel value="chatgpt" className="pt-3">
              <ChatGPTPanel />
            </TabsPanel>
            <TabsPanel value="claude" className="pt-3">
              <ClaudePanel />
            </TabsPanel>
          </Tabs>
        </DialogPanel>
      </DialogPopup>
    </Dialog>
  );
}

function ConnectedCard({
  title,
  lines,
  onDisconnect,
}: {
  title: string;
  lines: (string | undefined)[];
  onDisconnect: () => void;
}) {
  return (
    <div className="flex items-start gap-3 rounded-xl border bg-success/6 p-4">
      <div className="mt-0.5 grid size-7 place-items-center rounded-full bg-success/15 text-success-foreground">
        <Check className="size-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="font-medium text-sm">{title}</div>
        {lines.filter(Boolean).map((l) => (
          <div key={l} className="truncate text-muted-foreground text-xs">
            {l}
          </div>
        ))}
      </div>
      <Button variant="ghost" size="sm" onClick={onDisconnect}>
        <LogOut /> Disconnect
      </Button>
    </div>
  );
}

function Step({ n, children, done }: { n: number; children: React.ReactNode; done?: boolean }) {
  return (
    <div className="flex gap-3">
      <div
        className={cn(
          "mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border font-medium text-[11px]",
          done ? "border-success/30 bg-success/15 text-success-foreground" : "bg-card text-muted-foreground",
        )}
      >
        {done ? <Check className="size-3" /> : n}
      </div>
      <div className="min-w-0 flex-1 space-y-2">{children}</div>
    </div>
  );
}

function Disclosure({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-xl border">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-2 px-3.5 py-2.5 text-left font-medium text-sm"
      >
        {title}
        <ChevronDown className={cn("size-4 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>
      {open && <div className="space-y-3 border-t px-3.5 py-3">{children}</div>}
    </div>
  );
}

function fail(err: unknown) {
  toastManager.add({ type: "error", title: "Couldn't connect", description: err instanceof Error ? err.message : String(err) });
}

async function readLocal(provider: ProviderId): Promise<string> {
  const res = await fetch(`/api/local/credentials?provider=${provider}`, { headers: { "x-clevex": "1" } });
  const j = await res.json();
  if (!res.ok) throw new Error(j.error);
  return j.raw as string;
}

function ChatGPTPanel() {
  const creds = useCredentials();
  const server = useServerConfig();
  const [started, setStarted] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const [pasted, setPasted] = useState("");
  const [busy, setBusy] = useState(false);
  const [authJson, setAuthJson] = useState("");
  const poll = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => () => void (poll.current && clearInterval(poll.current)), []);

  const c = creds.chatgpt;
  if (c) {
    return (
      <ConnectedCard
        title="ChatGPT connected"
        lines={[
          c.email,
          [c.plan && `${c.plan[0].toUpperCase()}${c.plan.slice(1)} plan`, c.source === "import" ? "imported from Codex CLI" : "signed in with ChatGPT"]
            .filter(Boolean)
            .join(" · "),
        ]}
        onDisconnect={() => setCredentials((x) => ({ ...x, chatgpt: undefined }))}
      />
    );
  }

  const begin = async () => {
    const { url, state } = await startChatGPTLogin();
    window.open(url, "_blank", "noopener");
    setStarted(true);
    if (server?.local) {
      const r = await fetch("/api/local/chatgpt-callback", { method: "POST", headers: { "x-clevex": "1" } })
        .then((x) => x.json())
        .catch(() => ({ ok: false }));
      if (r.ok) {
        setWaiting(true);
        if (poll.current) clearInterval(poll.current);
        poll.current = setInterval(async () => {
          const j = await fetch(`/api/local/chatgpt-callback?state=${encodeURIComponent(state)}`, {
            headers: { "x-clevex": "1" },
          })
            .then((x) => x.json())
            .catch(() => ({}));
          if (j.code) {
            clearInterval(poll.current!);
            setWaiting(false);
            try {
              await completeChatGPTLogin(`http://localhost:1455/auth/callback?code=${j.code}&state=${state}`);
              toastManager.add({ type: "success", title: "ChatGPT connected" });
            } catch (e) {
              fail(e);
            }
          }
        }, 1200);
      }
    }
  };

  const finish = async () => {
    setBusy(true);
    try {
      await completeChatGPTLogin(pasted);
      toastManager.add({ type: "success", title: "ChatGPT connected" });
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      {server?.serverChatGPT && (
        <div className="flex items-center gap-2 rounded-lg bg-info/8 px-3 py-2 text-info-foreground text-xs">
          <ShieldCheck className="size-3.5" /> This server has a ChatGPT gateway configured, so GPT models work without
          signing in.
        </div>
      )}
      <Step n={1} done={started}>
        <p className="text-sm">Sign in with the ChatGPT account that has your Plus, Pro or Business plan.</p>
        <Button variant="outline" onClick={begin}>
          <ProviderGlyph provider="chatgpt" /> Sign in with ChatGPT <ArrowUpRight className="opacity-60" />
        </Button>
      </Step>
      <Step n={2}>
        {waiting ? (
          <p className="flex items-center gap-2 text-muted-foreground text-sm">
            <span className="size-2 animate-pulse rounded-full bg-brand" /> Waiting for you to finish signing in…
          </p>
        ) : (
          <p className="text-muted-foreground text-sm">
            After you approve, the browser lands on a <code className="rounded bg-muted px-1 text-xs">localhost:1455</code>{" "}
            page{server?.local ? "" : " that won't load"}. Copy that page&apos;s full URL from the address bar and paste it
            here.
          </p>
        )}
        <div className="flex gap-2">
          <Input
            placeholder="http://localhost:1455/auth/callback?code=…"
            value={pasted}
            onChange={(e) => setPasted(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && pasted && finish()}
          />
          <Button variant="brand" disabled={!pasted} loading={busy} onClick={finish}>
            Connect
          </Button>
        </div>
      </Step>

      <Disclosure title="Use the login from your Codex CLI instead">
        {server?.local && (
          <Button
            variant="outline"
            className="w-full"
            onClick={async () => {
              try {
                importCodexAuth(await readLocal("chatgpt"));
                toastManager.add({ type: "success", title: "Imported your Codex login" });
              } catch (e) {
                fail(e);
              }
            }}
          >
            <Laptop /> Import from this computer
          </Button>
        )}
        <p className="text-muted-foreground text-xs">
          Or run <code className="rounded bg-muted px-1">cat ~/.codex/auth.json | pbcopy</code> and paste it below. Imported
          sessions aren&apos;t refreshed by clevex, so your CLI keeps working.
        </p>
        <Textarea
          rows={3}
          placeholder='{"tokens": {"access_token": "…"}}'
          value={authJson}
          onChange={(e) => setAuthJson(e.target.value)}
          className="font-mono text-xs"
        />
        <Button
          size="sm"
          disabled={!authJson.trim()}
          onClick={() => {
            try {
              importCodexAuth(authJson);
              toastManager.add({ type: "success", title: "ChatGPT connected" });
            } catch (e) {
              fail(e);
            }
          }}
        >
          Import
        </Button>
      </Disclosure>
    </div>
  );
}

function ClaudePanel() {
  const creds = useCredentials();
  const server = useServerConfig();
  const [started, setStarted] = useState(false);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [token, setToken] = useState("");

  const c = creds.claude;
  if (c) {
    const how =
      c.kind === "anthropic-key"
        ? "Anthropic API key"
        : c.source === "setup-token"
          ? "long-lived token (claude setup-token)"
          : c.source === "import"
            ? "imported from Claude Code"
            : "signed in with Claude";
    return (
      <ConnectedCard
        title="Claude connected"
        lines={[c.kind === "claude-oauth" ? c.email : undefined, [c.kind === "claude-oauth" && c.plan, how].filter(Boolean).join(" · ")]}
        onDisconnect={() => setCredentials((x) => ({ ...x, claude: undefined }))}
      />
    );
  }

  const finish = async () => {
    setBusy(true);
    try {
      await completeClaudeLogin(code);
      toastManager.add({ type: "success", title: "Claude connected" });
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      {server?.serverClaude && (
        <div className="flex items-center gap-2 rounded-lg bg-info/8 px-3 py-2 text-info-foreground text-xs">
          <ShieldCheck className="size-3.5" /> This server already has a Claude token, so Claude models work without
          signing in.
        </div>
      )}
      <Step n={1} done={started}>
        <p className="text-sm">Sign in with the Claude account that has your Pro or Max plan.</p>
        <Button
          variant="outline"
          onClick={async () => {
            const { url } = await startClaudeLogin();
            window.open(url, "_blank", "noopener");
            setStarted(true);
          }}
        >
          <ProviderGlyph provider="claude" /> Sign in with Claude <ArrowUpRight className="opacity-60" />
        </Button>
      </Step>
      <Step n={2}>
        <p className="text-muted-foreground text-sm">After you click Authorize, Claude shows a code. Paste it here.</p>
        <div className="flex gap-2">
          <Input
            placeholder="Paste the authentication code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && code && finish()}
          />
          <Button variant="brand" disabled={!code} loading={busy} onClick={finish}>
            Connect
          </Button>
        </div>
      </Step>

      <Disclosure title="Use a token from Claude Code instead">
        {server?.local && (
          <Button
            variant="outline"
            className="w-full"
            onClick={async () => {
              try {
                importClaudeCredentials(await readLocal("claude"));
                toastManager.add({ type: "success", title: "Imported your Claude Code login" });
              } catch (e) {
                fail(e);
              }
            }}
          >
            <Laptop /> Import from this computer
          </Button>
        )}
        <p className="text-muted-foreground text-xs">
          Run <code className="rounded bg-muted px-1">claude setup-token</code> in a terminal and paste the{" "}
          <code className="rounded bg-muted px-1">sk-ant-oat…</code> token. It lasts a year. An Anthropic API key (
          <code className="rounded bg-muted px-1">sk-ant-api…</code>) works too and is billed per use.
        </p>
        <div className="flex gap-2">
          <Input
            type="password"
            placeholder="sk-ant-oat01-…"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            className="font-mono"
          />
          <Button
            disabled={!token.trim()}
            onClick={() => {
              try {
                saveClaudeToken(token);
                toastManager.add({ type: "success", title: "Claude connected" });
              } catch (e) {
                fail(e);
              }
            }}
          >
            Save
          </Button>
        </div>
      </Disclosure>

      <p className="flex gap-2 text-muted-foreground text-xs leading-relaxed">
        <TriangleAlert className="mt-0.5 size-3.5 shrink-0 text-warning" />
        Anthropic limits subscription tokens to its own apps and may reject them here or bill extra usage. If Claude replies
        fail, connect an API key instead.
      </p>
    </div>
  );
}

export function ConnectionPills({ onOpen }: { onOpen: (p: ProviderId) => void }) {
  const creds = useCredentials();
  const server = useServerConfig();
  const items: { id: ProviderId; label: string; on: boolean }[] = [
    { id: "chatgpt", label: "ChatGPT", on: !!creds.chatgpt || !!server?.serverChatGPT },
    { id: "claude", label: "Claude", on: !!creds.claude || !!server?.serverClaude },
  ];
  return (
    <div className="flex items-center gap-1.5">
      {items.map((i) => (
        <button
          type="button"
          key={i.id}
          onClick={() => onOpen(i.id)}
          className={cn(
            "inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 font-medium text-xs transition-colors hover:bg-accent",
            !i.on && "border-dashed text-muted-foreground",
          )}
        >
          <ProviderGlyph provider={i.id} className="size-3.5" />
          {i.label}
          <span className={cn("size-1.5 rounded-full", i.on ? "bg-success" : "bg-muted-foreground/40")} />
        </button>
      ))}
    </div>
  );
}

