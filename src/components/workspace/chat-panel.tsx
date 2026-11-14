"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  ArrowUp,
  BookMarked,
  Brain,
  ChevronRight,
  CheckCheck,
  History,
  ImagePlus,
  Mic,
  MicOff,
  Plus,
  Sparkles,
  Square,
  TextQuote,
  Trash2,
  Wand2,
  Wrench,
  X,
} from "lucide-react";
import { CleveMark, ProviderGlyph } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { Menu, MenuGroup, MenuGroupLabel, MenuItem, MenuPopup, MenuSeparator, MenuTrigger } from "@/components/ui/menu";
import { Tooltip, TooltipPopup, TooltipTrigger } from "@/components/ui/tooltip";
import { streamCompletion } from "@/lib/ai/client";
import { applyBlock, splitSegments, type EditBlock } from "@/lib/ai/edits";
import { modelLabel, providerOf } from "@/lib/ai/models";
import { buildProjectContext, buildTurnContext, CHAT_SYSTEM } from "@/lib/ai/prompts";
import { deleteThread, listThreads, saveThread, uid } from "@/lib/db";
import { useSettings } from "@/lib/settings";
import type { ChatImage, ChatMessage, ChatThread, CompileError, ProjectFile, ProviderId } from "@/lib/types";
import { cn, now } from "@/lib/utils";
import { bytesToBase64 } from "@/lib/zip";
import { EditCard } from "./edit-card";
import { Markdown } from "./markdown";
import { ModelPicker } from "./model-picker";

export type ExternalPrompt = { id: string; text: string; images?: ChatImage[]; label?: string };

type Props = {
  projectId: string;
  files: ProjectFile[];
  mainFile: string;
  activeFile: string;
  errors: CompileError[];
  getEditorState: () => { selection: string; cursorLine: number };
  writeFile: (path: string, content: string) => void;
  openFile: (path: string) => void;
  onConnect: (p: ProviderId) => void;
  externalPrompt: ExternalPrompt | null;
  onClose?: () => void;
};

const SUGGESTIONS = [
  { icon: Wand2, label: "Tighten the abstract", prompt: "Tighten the abstract: make it clearer and more concise without changing its claims." },
  { icon: TextQuote, label: "Proofread the open file", prompt: "Proofread the open file for grammar, clarity and LaTeX issues. Fix what you find with edit blocks." },
  { icon: BookMarked, label: "Suggest related work", prompt: "Suggest 5 well-known papers I should cite for this work, with BibTeX entries added to the .bib file. Only include papers you are confident exist." },
  { icon: Sparkles, label: "Explain the main result", prompt: "Explain the main result of this document in plain language, then list any gaps in the argument." },
];

export function ChatPanel(props: Props) {
  const settings = useSettings();
  const [threads, setThreads] = useState<ChatThread[]>([]);
  const [thread, setThread] = useState<ChatThread | null>(null);
  const [input, setInput] = useState("");
  const [images, setImages] = useState<ChatImage[]>([]);
  const [busy, setBusy] = useState(false);
  const [streaming, setStreaming] = useState<{ text: string; thinking: string } | null>(null);
  const [includeSelection, setIncludeSelection] = useState(true);
  const [failReasons, setFailReasons] = useState<Record<string, string>>({});
  const [selPreview, setSelPreview] = useState("");
  const undoStack = useRef(new Map<string, { path: string; content: string }>());
  const abort = useRef<AbortController | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const filesRef = useRef(props.files);
  useLayoutEffect(() => {
    filesRef.current = props.files;
  }, [props.files]);

  // Load threads.
  useEffect(() => {
    listThreads(props.projectId).then((ts) => {
      setThreads(ts);
      setThread(ts[0] ?? null);
    });
  }, [props.projectId]);

  // Peek at the selection so the context chip is accurate.
  useEffect(() => {
    const id = setInterval(() => {
      const s = props.getEditorState().selection;
      setSelPreview((prev) => (prev === s ? prev : s));
    }, 700);
    return () => clearInterval(id);
  }, [props]);

  const scrollToBottom = useCallback((smooth = false) => {
    const el = scroller.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: smooth ? "smooth" : "auto" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [thread?.id, scrollToBottom]);

  useEffect(() => {
    const el = scroller.current;
    if (!el || !streaming) return;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 160) scrollToBottom();
  }, [streaming, scrollToBottom]);

  const persist = useCallback(async (t: ChatThread) => {
    setThread(t);
    setThreads((ts) => [t, ...ts.filter((x) => x.id !== t.id)]);
    await saveThread(t);
  }, []);

  const send = useCallback(
    async (text: string, imgs: ChatImage[] = [], label?: string) => {
      if (busy || (!text.trim() && !imgs.length)) return;
      const editor = props.getEditorState();
      const ts = now();
      const userMsg: ChatMessage = {
        id: uid("m_"),
        role: "user",
        text: label ?? text,
        images: imgs.length ? imgs : undefined,
        createdAt: ts,
      };
      const base: ChatThread = thread ?? {
        id: uid("t_"),
        projectId: props.projectId,
        title: (label ?? text).slice(0, 60) || "Image",
        messages: [],
        updatedAt: ts,
      };
      const withUser: ChatThread = { ...base, messages: [...base.messages, userMsg], updatedAt: ts };
      await persist(withUser);
      setInput("");
      setImages([]);
      setBusy(true);
      setStreaming({ text: "", thinking: "" });
      requestAnimationFrame(() => scrollToBottom(true));

      const turnContext = buildTurnContext({
        activeFile: props.activeFile,
        cursorLine: editor.cursorLine,
        selection: includeSelection ? editor.selection : undefined,
        errors: props.errors,
      });
      // The full prompt for this turn (label is just what the user sees).
      const history = withUser.messages.map((m, i) => ({
        role: m.role,
        text: i === withUser.messages.length - 1 ? turnContext + text : m.text,
        images: m.images,
      }));

      const controller = new AbortController();
      abort.current = controller;
      const model = settings.model;
      const result = await streamCompletion({
        model,
        system: CHAT_SYSTEM,
        context: buildProjectContext(filesRef.current, props.mainFile),
        messages: history,
        effort: settings.effort,
        sessionId: withUser.id,
        signal: controller.signal,
        onText: (_d, full) => setStreaming((s) => ({ text: full, thinking: s?.thinking ?? "" })),
        onThinking: (_d, full) => setStreaming((s) => ({ text: s?.text ?? "", thinking: full })),
      });
      abort.current = null;
      const reply: ChatMessage = {
        id: uid("m_"),
        role: "assistant",
        text: result.text,
        thinking: result.thinking || undefined,
        model: result.model,
        provider: providerOf(model),
        error: result.error,
        createdAt: now(),
      };
      setStreaming(null);
      setBusy(false);
      await persist({ ...withUser, messages: [...withUser.messages, reply], updatedAt: now() });
    },
    [busy, thread, props, includeSelection, settings.model, settings.effort, persist, scrollToBottom],
  );

  // Prompts triggered from elsewhere (Fix errors, image to LaTeX…).
  const lastExternal = useRef<string | null>(null);
  useEffect(() => {
    const p = props.externalPrompt;
    if (!p || lastExternal.current === p.id) return;
    lastExternal.current = p.id;
    send(p.text, p.images ?? [], p.label);
  }, [props.externalPrompt, send]);

  const setStatus = async (msg: ChatMessage, idx: number, status: "applied" | "rejected" | "failed") => {
    if (!thread) return;
    const messages = thread.messages.map((m) =>
      m.id === msg.id ? { ...m, applied: { ...(m.applied ?? {}), [idx]: status } } : m,
    );
    await persist({ ...thread, messages, updatedAt: now() });
  };

  const apply = (msg: ChatMessage, idx: number, block: EditBlock) => {
    const current = filesRef.current.find((f) => f.path === block.file)?.content;
    const outcome = applyBlock(current, block);
    const key = `${msg.id}:${idx}`;
    if (!outcome.ok) {
      setFailReasons((r) => ({ ...r, [key]: outcome.reason }));
      setStatus(msg, idx, "failed");
      return false;
    }
    if (current !== undefined) undoStack.current.set(key, { path: block.file, content: current });
    props.writeFile(block.file, outcome.content);
    // Keep the ref fresh so "Apply all" chains edits to the same file.
    filesRef.current = filesRef.current.some((f) => f.path === block.file)
      ? filesRef.current.map((f) => (f.path === block.file ? { ...f, content: outcome.content } : f))
      : [...filesRef.current, { path: block.file, content: outcome.content, updatedAt: now() }];
    setStatus(msg, idx, "applied");
    return true;
  };

  const applyAll = async (msg: ChatMessage) => {
    if (!thread) return;
    const segs = splitSegments(msg.text).filter((s) => s.type === "block");
    const applied: Record<string, "applied" | "rejected" | "failed"> = { ...(msg.applied ?? {}) };
    for (const s of segs) {
      if (s.type !== "block" || applied[s.index] === "applied" || applied[s.index] === "rejected") continue;
      const current = filesRef.current.find((f) => f.path === s.block.file)?.content;
      const outcome = applyBlock(current, s.block);
      const key = `${msg.id}:${s.index}`;
      if (!outcome.ok) {
        setFailReasons((r) => ({ ...r, [key]: outcome.reason }));
        applied[s.index] = "failed";
        continue;
      }
      if (current !== undefined) undoStack.current.set(key, { path: s.block.file, content: current });
      props.writeFile(s.block.file, outcome.content);
      filesRef.current = filesRef.current.some((f) => f.path === s.block.file)
        ? filesRef.current.map((f) => (f.path === s.block.file ? { ...f, content: outcome.content } : f))
        : [...filesRef.current, { path: s.block.file, content: outcome.content, updatedAt: now() }];
      applied[s.index] = "applied";
    }
    const messages = thread.messages.map((m) => (m.id === msg.id ? { ...m, applied } : m));
    await persist({ ...thread, messages, updatedAt: now() });
  };

  const addImages = async (list: FileList | File[]) => {
    const next: ChatImage[] = [];
    for (const f of Array.from(list)) {
      if (!f.type.startsWith("image/")) continue;
      if (f.size > 8 * 1024 * 1024) continue;
      next.push({ mime: f.type, name: f.name, data: bytesToBase64(new Uint8Array(await f.arrayBuffer())) });
    }
    setImages((imgs) => [...imgs, ...next].slice(0, 4));
  };

  const messages = thread?.messages ?? [];
  const selectionLines = selPreview ? selPreview.split("\n").length : 0;

  return (
    <div className="flex h-full min-h-0 flex-col bg-card">
      {/* Header */}
      <div className="flex h-10 shrink-0 items-center gap-1 border-b px-2">
        <div className="flex min-w-0 flex-1 items-center gap-1.5 px-1">
          <Sparkles className="size-3.5 shrink-0 text-brand" />
          <span className="truncate font-medium text-sm">{thread?.title ?? "New chat"}</span>
        </div>
        <Menu>
          <MenuTrigger render={<Button variant="ghost" size="icon-xs" aria-label="Chat history" />}>
            <History />
          </MenuTrigger>
          <MenuPopup align="end" className="max-h-80 w-72">
            <MenuGroup>
              <MenuGroupLabel>Chats in this project</MenuGroupLabel>
              {threads.length === 0 && <div className="px-2 py-1.5 text-muted-foreground text-xs">No chats yet</div>}
              {threads.map((t) => (
                <MenuItem key={t.id} onClick={() => setThread(t)} className={cn(t.id === thread?.id && "bg-accent")}>
                  <span className="truncate">{t.title}</span>
                </MenuItem>
              ))}
            </MenuGroup>
            {thread && (
              <>
                <MenuSeparator />
                <MenuItem
                  variant="destructive"
                  onClick={async () => {
                    await deleteThread(thread.id);
                    const rest = threads.filter((t) => t.id !== thread.id);
                    setThreads(rest);
                    setThread(rest[0] ?? null);
                  }}
                >
                  <Trash2 /> Delete this chat
                </MenuItem>
              </>
            )}
          </MenuPopup>
        </Menu>
        <Tooltip>
          <TooltipTrigger
            render={
              <Button variant="ghost" size="icon-xs" aria-label="New chat" disabled={busy} onClick={() => setThread(null)} />
            }
          >
            <Plus />
          </TooltipTrigger>
          <TooltipPopup>New chat</TooltipPopup>
        </Tooltip>
        {props.onClose && (
          <Button variant="ghost" size="icon-xs" aria-label="Close chat" onClick={props.onClose}>
            <X />
          </Button>
        )}
      </div>

      {/* Messages */}
      <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto">
        {messages.length === 0 && !streaming ? (
          <div className="flex h-full flex-col justify-end gap-4 p-4">
            <div className="px-1">
              <CleveMark className="h-9 w-auto animate-blob" blink />
              <h3 className="mt-3 font-serif text-2xl leading-tight">How can I help with this paper?</h3>
              <p className="mt-1 text-muted-foreground text-sm">
                I can see every file in the project. Ask for edits and I&apos;ll propose changes you can apply.
              </p>
            </div>
            <div className="grid gap-1.5">
              {props.errors.some((e) => e.level === "error") && (
                <SuggestionButton
                  icon={Wrench}
                  label="Fix the compile errors"
                  tone="danger"
                  onClick={() => send("Fix the compile errors with edit blocks.", [], "Fix the compile errors")}
                />
              )}
              {SUGGESTIONS.map((s) => (
                <SuggestionButton key={s.label} icon={s.icon} label={s.label} onClick={() => send(s.prompt, [], s.label)} />
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-5 px-4 py-4">
            {messages.map((m) =>
              m.role === "user" ? (
                <UserBubble key={m.id} msg={m} />
              ) : (
                <AssistantMessage
                  key={m.id}
                  msg={m}
                  files={props.files}
                  failReasons={failReasons}
                  onApply={(idx, block) => apply(m, idx, block)}
                  onReject={(idx) => setStatus(m, idx, "rejected")}
                  onUndo={(idx) => {
                    const prev = undoStack.current.get(`${m.id}:${idx}`);
                    if (!prev) return;
                    props.writeFile(prev.path, prev.content);
                    undoStack.current.delete(`${m.id}:${idx}`);
                    setStatus(m, idx, "rejected");
                  }}
                  canUndo={(idx) => undoStack.current.has(`${m.id}:${idx}`)}
                  onApplyAll={() => applyAll(m)}
                  onOpenFile={props.openFile}
                />
              ),
            )}
            {streaming && (
              <AssistantMessage
                msg={{
                  id: "streaming",
                  role: "assistant",
                  text: streaming.text,
                  thinking: streaming.thinking,
                  model: settings.model,
                  provider: providerOf(settings.model),
                  createdAt: 0,
                }}
                streaming
                files={props.files}
                failReasons={{}}
                onApply={() => {}}
                onReject={() => {}}
                onUndo={() => {}}
                canUndo={() => false}
                onApplyAll={() => {}}
                onOpenFile={props.openFile}
              />
            )}
          </div>
        )}
      </div>

      {/* Composer */}
      <div className="shrink-0 p-3 pt-1">
        <div
          className="rounded-2xl border bg-background shadow-xs/5 transition-shadow focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/20"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            if (e.dataTransfer.files.length) addImages(e.dataTransfer.files);
          }}
        >
          {(images.length > 0 || (selectionLines > 0 && includeSelection)) && (
            <div className="flex flex-wrap items-center gap-1.5 px-3 pt-2.5">
              {selectionLines > 0 && includeSelection && (
                <span className="inline-flex h-6 items-center gap-1 rounded-md bg-brand-faint px-2 text-brand-strong text-xs">
                  <TextQuote className="size-3" /> Selection · {selectionLines} line{selectionLines > 1 ? "s" : ""}
                  <button type="button" aria-label="Don't include selection" onClick={() => setIncludeSelection(false)}>
                    <X className="size-3 opacity-60 hover:opacity-100" />
                  </button>
                </span>
              )}
              {images.map((img, i) => (
                <span key={i} className="group relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`data:${img.mime};base64,${img.data}`}
                    alt={img.name ?? "attachment"}
                    className="size-12 rounded-lg border object-cover"
                  />
                  <button
                    type="button"
                    aria-label="Remove image"
                    onClick={() => setImages((xs) => xs.filter((_, j) => j !== i))}
                    className="absolute -top-1.5 -right-1.5 grid size-4 place-items-center rounded-full bg-foreground text-background opacity-0 transition-opacity group-hover:opacity-100"
                  >
                    <X className="size-2.5" />
                  </button>
                </span>
              ))}
            </div>
          )}
          <textarea
            ref={textarea}
            rows={1}
            value={input}
            placeholder={busy ? "Thinking…" : "Ask anything, or describe an edit…"}
            onChange={(e) => {
              setInput(e.target.value);
              const el = e.target;
              el.style.height = "auto";
              el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
            }}
            onPaste={(e) => {
              const imgs = Array.from(e.clipboardData.files).filter((f) => f.type.startsWith("image/"));
              if (imgs.length) {
                e.preventDefault();
                addImages(imgs);
              }
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                send(input, images);
                if (textarea.current) textarea.current.style.height = "auto";
              }
            }}
            className="block max-h-[200px] min-h-[44px] w-full resize-none bg-transparent px-3.5 pt-3 pb-1 text-sm outline-none placeholder:text-muted-foreground/70"
          />
          <div className="flex items-center gap-0.5 px-2 pb-2">
            <ModelPicker onConnect={props.onConnect} />
            {selectionLines > 0 && !includeSelection && (
              <Button variant="ghost" size="xs" onClick={() => setIncludeSelection(true)} className="text-muted-foreground">
                <TextQuote /> Add selection
              </Button>
            )}
            <div className="ml-auto flex items-center gap-0.5">
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button variant="ghost" size="icon-sm" aria-label="Attach image" onClick={() => fileInput.current?.click()} />
                  }
                >
                  <ImagePlus />
                </TooltipTrigger>
                <TooltipPopup>Attach an image (handwriting, figure, whiteboard)</TooltipPopup>
              </Tooltip>
              <input
                ref={fileInput}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => {
                  if (e.target.files) addImages(e.target.files);
                  e.target.value = "";
                }}
              />
              <DictationButton onText={(t) => setInput((v) => (v ? `${v.trimEnd()} ${t}` : t))} />
              {busy ? (
                <Button size="icon-sm" variant="outline" aria-label="Stop" onClick={() => abort.current?.abort()}>
                  <Square className="size-3 fill-current" />
                </Button>
              ) : (
                <Button
                  size="icon-sm"
                  variant="brand"
                  aria-label="Send"
                  disabled={!input.trim() && !images.length}
                  onClick={() => send(input, images)}
                  className="rounded-full"
                >
                  <ArrowUp />
                </Button>
              )}
            </div>
          </div>
        </div>
        <p className="mt-1.5 px-1 text-[11px] text-muted-foreground/80">
          Runs on your {providerOf(settings.model) === "chatgpt" ? "ChatGPT" : "Claude"} plan. Check facts and citations
          before you submit.
        </p>
      </div>
    </div>
  );
}

function SuggestionButton({
  icon: Icon,
  label,
  onClick,
  tone,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  onClick: () => void;
  tone?: "danger";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group flex items-center gap-2.5 rounded-xl border bg-background px-3 py-2 text-left text-sm transition-colors hover:border-brand/30 hover:bg-brand-faint",
        tone === "danger" && "border-destructive/25 bg-destructive/5 hover:border-destructive/40 hover:bg-destructive/8",
      )}
    >
      <Icon className={cn("size-4 shrink-0 text-muted-foreground group-hover:text-brand", tone === "danger" && "text-destructive-foreground")} />
      <span className="flex-1">{label}</span>
      <ChevronRight className="size-3.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
    </button>
  );
}

function UserBubble({ msg }: { msg: ChatMessage }) {
  return (
    <div className="flex flex-col items-end gap-1.5">
      {msg.images && (
        <div className="flex flex-wrap justify-end gap-1.5">
          {msg.images.map((img, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={i}
              src={`data:${img.mime};base64,${img.data}`}
              alt={img.name ?? "attachment"}
              className="max-h-40 max-w-[12rem] rounded-xl border object-cover"
            />
          ))}
        </div>
      )}
      {msg.text && (
        <div className="max-w-[88%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-secondary px-3.5 py-2 text-sm">
          {msg.text}
        </div>
      )}
    </div>
  );
}

function AssistantMessage({
  msg,
  streaming,
  files,
  failReasons,
  onApply,
  onReject,
  onUndo,
  canUndo,
  onApplyAll,
  onOpenFile,
}: {
  msg: ChatMessage;
  streaming?: boolean;
  files: ProjectFile[];
  failReasons: Record<string, string>;
  onApply: (idx: number, block: EditBlock) => void;
  onReject: (idx: number) => void;
  onUndo: (idx: number) => void;
  canUndo: (idx: number) => boolean;
  onApplyAll: () => void;
  onOpenFile: (path: string) => void;
}) {
  const segments = useMemo(() => splitSegments(msg.text), [msg.text]);
  const blocks = segments.filter((s) => s.type === "block");
  const pending = blocks.filter((s) => s.type === "block" && !msg.applied?.[s.index]).length;
  const [showThinking, setShowThinking] = useState(false);
  const provider = msg.provider ?? providerOf(msg.model ?? "");

  return (
    <div className="group/msg">
      <div className="mb-1.5 flex items-center gap-1.5 text-muted-foreground text-xs">
        <ProviderGlyph provider={provider} className="size-3.5" />
        <span className="font-medium">{modelLabel(msg.model ?? "")}</span>
      </div>
      {msg.thinking && (
        <button
          type="button"
          onClick={() => setShowThinking((s) => !s)}
          className="mb-2 flex items-center gap-1.5 text-muted-foreground text-xs hover:text-foreground"
        >
          <Brain className={cn("size-3.5", streaming && !msg.text && "animate-pulse text-brand")} />
          {streaming && !msg.text ? "Thinking…" : "Reasoning"}
          <ChevronRight className={cn("size-3 transition-transform", showThinking && "rotate-90")} />
        </button>
      )}
      {msg.thinking && (showThinking || (streaming && !msg.text)) && (
        <div className="mb-3 max-h-48 overflow-y-auto whitespace-pre-wrap border-l-2 pl-3 text-muted-foreground text-xs leading-relaxed">
          {msg.thinking.trim()}
        </div>
      )}
      <div className="space-y-3">
        {segments.map((s, i) =>
          s.type === "text" ? (
            <Markdown key={i} text={s.text} />
          ) : (
            <EditCard
              key={i}
              block={s.block}
              status={msg.applied?.[s.index]}
              pending={streaming}
              failReason={failReasons[`${msg.id}:${s.index}`]}
              existing={files.find((f) => f.path === s.block.file)?.content}
              onApply={() => onApply(s.index, s.block)}
              onReject={() => onReject(s.index)}
              onUndo={canUndo(s.index) ? () => onUndo(s.index) : undefined}
              onOpenFile={() => onOpenFile(s.block.file)}
            />
          ),
        )}
        {streaming && !msg.text && !msg.thinking && (
          <div className="flex items-center gap-1 py-1">
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className="size-1.5 animate-pulse rounded-full bg-brand/70"
                style={{ animationDelay: `${i * 150}ms` }}
              />
            ))}
          </div>
        )}
        {msg.error && (
          <div className="rounded-xl border border-destructive/25 bg-destructive/6 px-3 py-2 text-destructive-foreground text-sm">
            {msg.error}
          </div>
        )}
        {!streaming && pending > 1 && (
          <Button variant="outline" size="sm" onClick={onApplyAll}>
            <CheckCheck /> Apply all {pending} edits
          </Button>
        )}
      </div>
    </div>
  );
}

type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> ; resultIndex: number }) => void) | null;
  onend: (() => void) | null;
};

function DictationButton({ onText }: { onText: (t: string) => void }) {
  const [supported] = useState(() => {
    if (typeof window === "undefined") return false;
    const w = window as unknown as { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown };
    return !!(w.SpeechRecognition || w.webkitSpeechRecognition);
  });
  const [on, setOn] = useState(false);
  const rec = useRef<SpeechRecognitionLike | null>(null);
  if (!supported) return null;
  const toggle = () => {
    if (on) {
      rec.current?.stop();
      return;
    }
    const w = window as unknown as { SpeechRecognition?: new () => SpeechRecognitionLike; webkitSpeechRecognition?: new () => SpeechRecognitionLike };
    const Ctor = (w.SpeechRecognition || w.webkitSpeechRecognition)!;
    const r = new Ctor();
    r.continuous = true;
    r.interimResults = false;
    r.lang = navigator.language || "en-US";
    r.onresult = (e) => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) onText(e.results[i][0].transcript.trim());
      }
    };
    r.onend = () => setOn(false);
    rec.current = r;
    r.start();
    setOn(true);
  };
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={on ? "Stop dictation" : "Dictate"}
            onClick={toggle}
            className={cn(on && "bg-destructive/10 text-destructive-foreground")}
          />
        }
      >
        {on ? <MicOff /> : <Mic />}
      </TooltipTrigger>
      <TooltipPopup>{on ? "Stop dictation" : "Dictate with your voice"}</TooltipPopup>
    </Tooltip>
  );
}
