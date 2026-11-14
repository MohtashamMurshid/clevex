"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowUp, Check, CornerDownLeft, RotateCcw, Sparkles, Square, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { streamCompletion } from "@/lib/ai/client";
import { buildProjectContext, INLINE_SYSTEM } from "@/lib/ai/prompts";
import { modelLabel } from "@/lib/ai/models";
import { useSettings } from "@/lib/settings";
import type { ProjectFile } from "@/lib/types";
import { cn } from "@/lib/utils";

export type InlineTarget = {
  from: number;
  to: number;
  text: string;
  file: string;
  top: number;
  /** Top edge of the selection, used to flip the popover above when there's no room below. */
  above: number;
  left: number;
  before: string;
  after: string;
};

const QUICK = [
  { label: "Improve", prompt: "Improve the writing: clearer, tighter, same meaning." },
  { label: "Shorten", prompt: "Make this about 30% shorter without losing content." },
  { label: "Fix grammar", prompt: "Fix grammar, spelling and LaTeX typos only." },
  { label: "More formal", prompt: "Rewrite in a formal academic register." },
  { label: "To table", prompt: "Convert this into a booktabs LaTeX table." },
];

const QUICK_EMPTY = [
  { label: "Paragraph", prompt: "Write the next paragraph, following the surrounding text." },
  { label: "Equation", prompt: "Write the equation being described in the surrounding text, in an equation environment." },
  { label: "Figure", prompt: "Insert a figure environment skeleton with caption and label that fits here." },
];

function clean(out: string) {
  return out.replace(/^```(?:latex|tex)?\n?/, "").replace(/\n?```\s*$/, "");
}

export function InlineAI({
  target,
  files,
  mainFile,
  onAccept,
  onClose,
}: {
  target: InlineTarget;
  files: ProjectFile[];
  mainFile: string;
  onAccept: (text: string) => void;
  onClose: () => void;
}) {
  const settings = useSettings();
  const [instruction, setInstruction] = useState("");
  const [result, setResult] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastPrompt, setLastPrompt] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const abort = useRef<AbortController | null>(null);
  const empty = !target.text.trim();

  useEffect(() => {
    input.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const run = async (prompt: string) => {
    if (!prompt.trim() || busy) return;
    setLastPrompt(prompt);
    setBusy(true);
    setError(null);
    setResult("");
    const c = new AbortController();
    abort.current = c;
    const body = empty
      ? `Instruction: ${prompt}\n\nWrite new LaTeX to insert at the cursor in ${target.file}.\n\n<before_cursor>\n${target.before}\n</before_cursor>\n<after_cursor>\n${target.after}\n</after_cursor>`
      : `Instruction: ${prompt}\n\nFile: ${target.file}\n\n<context_before>\n${target.before}\n</context_before>\n<selection>\n${target.text}\n</selection>\n<context_after>\n${target.after}\n</context_after>\n\nReturn only the replacement for <selection>.`;
    const r = await streamCompletion({
      model: settings.model,
      system: INLINE_SYSTEM,
      context: buildProjectContext(files, mainFile, 120_000),
      messages: [{ role: "user", text: body }],
      effort: "low",
      signal: c.signal,
      onText: (_d, full) => setResult(clean(full)),
    });
    abort.current = null;
    setBusy(false);
    if (r.error) setError(r.error);
    else setResult(clean(r.text));
  };

  const roomBelow = window.innerHeight - target.top;
  const top = roomBelow > 320 ? target.top + 8 : Math.max(12, target.above - 8 - 300);
  const left = Math.min(Math.max(12, target.left - 24), window.innerWidth - 492);

  return (
    <div
      className="fixed z-50 w-[480px] max-w-[calc(100vw-24px)] animate-pop-in overflow-hidden rounded-2xl border bg-popover text-popover-foreground shadow-pop"
      style={{ top, left }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div className="flex items-center gap-2 px-3 pt-2.5">
        <Sparkles className="size-4 shrink-0 text-brand" />
        <input
          ref={input}
          value={instruction}
          onChange={(e) => setInstruction(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              if (result && !busy && !instruction.trim()) onAccept(result);
              else run(instruction);
            }
          }}
          placeholder={empty ? "What should I write here?" : "How should I change the selection?"}
          className="h-8 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/70"
        />
        {busy ? (
          <Button size="icon-xs" variant="outline" aria-label="Stop" onClick={() => abort.current?.abort()}>
            <Square className="size-2.5 fill-current" />
          </Button>
        ) : (
          <Button size="icon-xs" variant="brand" aria-label="Run" disabled={!instruction.trim()} onClick={() => run(instruction)} className="rounded-full">
            <ArrowUp />
          </Button>
        )}
        <Button size="icon-xs" variant="ghost" aria-label="Close" onClick={onClose}>
          <X />
        </Button>
      </div>

      {!result && !busy && !error && (
        <div className="flex flex-wrap gap-1 px-3 pt-1.5 pb-2.5">
          {(empty ? QUICK_EMPTY : QUICK).map((q) => (
            <button
              type="button"
              key={q.label}
              onClick={() => run(q.prompt)}
              className="h-6 rounded-full border px-2.5 text-muted-foreground text-xs transition-colors hover:border-brand/30 hover:bg-brand-faint hover:text-foreground"
            >
              {q.label}
            </button>
          ))}
        </div>
      )}

      {(result || busy || error) && (
        <div className="mt-2 border-t">
          {error ? (
            <div className="px-3 py-2.5 text-destructive-foreground text-sm">{error}</div>
          ) : (
            <pre
              className={cn(
                "max-h-56 overflow-auto whitespace-pre-wrap break-words bg-success/5 px-3 py-2.5 font-mono text-[12px] leading-relaxed",
                busy && !result && "text-muted-foreground",
              )}
            >
              {result || "Writing…"}
              {busy && <span className="ml-0.5 inline-block h-3.5 w-1.5 translate-y-0.5 animate-pulse bg-brand" />}
            </pre>
          )}
          <div className="flex items-center gap-1.5 border-t bg-muted/50 px-2.5 py-1.5">
            <span className="truncate text-[11px] text-muted-foreground">{modelLabel(settings.model)}</span>
            <div className="ml-auto flex items-center gap-1">
              {!busy && lastPrompt && (
                <Button size="xs" variant="ghost" onClick={() => run(lastPrompt)}>
                  <RotateCcw /> Retry
                </Button>
              )}
              <Button size="xs" variant="ghost" onClick={onClose}>
                Discard
              </Button>
              <Button size="xs" variant="brand" disabled={busy || !result} onClick={() => onAccept(result)}>
                <Check /> {empty ? "Insert" : "Replace"}
                <Kbd className="ml-0.5 bg-white/20 text-current">
                  <CornerDownLeft className="size-3" />
                </Kbd>
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
