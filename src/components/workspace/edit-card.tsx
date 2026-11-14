"use client";

import { useMemo, useState } from "react";
import { diffLines } from "diff";
import { Check, ChevronDown, FilePlus2, FileText, TriangleAlert, Undo2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import type { EditBlock } from "@/lib/ai/edits";
import { cn } from "@/lib/utils";

export type EditStatus = "applied" | "rejected" | "failed" | undefined;

type Line = { kind: "add" | "del" | "ctx" | "gap"; text: string };

function toLines(before: string, after: string): Line[] {
  const parts = diffLines(before, after);
  const out: Line[] = [];
  for (const p of parts) {
    const lines = p.value.replace(/\n$/, "").split("\n");
    if (p.added) lines.forEach((l) => out.push({ kind: "add", text: l }));
    else if (p.removed) lines.forEach((l) => out.push({ kind: "del", text: l }));
    else {
      if (lines.length > 4) {
        out.push({ kind: "ctx", text: lines[0] }, { kind: "gap", text: `${lines.length - 2} unchanged lines` }, { kind: "ctx", text: lines[lines.length - 1] });
      } else lines.forEach((l) => out.push({ kind: "ctx", text: l }));
    }
  }
  return out;
}

export function EditCard({
  block,
  status,
  failReason,
  existing,
  onApply,
  onReject,
  onUndo,
  onOpenFile,
  pending,
}: {
  pending?: boolean;
  block: EditBlock;
  status: EditStatus;
  failReason?: string;
  existing?: string;
  onApply: () => void;
  onReject: () => void;
  onUndo?: () => void;
  onOpenFile: () => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const lines = useMemo(() => {
    if (block.kind === "file") return toLines(existing ?? "", block.content);
    const all: Line[] = [];
    block.hunks.forEach((h, i) => {
      if (i > 0) all.push({ kind: "gap", text: "" });
      all.push(...toLines(h.search, h.replace));
    });
    return all;
  }, [block, existing]);
  const adds = lines.filter((l) => l.kind === "add").length;
  const dels = lines.filter((l) => l.kind === "del").length;
  const isNew = block.kind === "file" && existing === undefined;

  return (
    <div
      className={cn(
        "overflow-hidden rounded-xl border bg-card shadow-xs/5 transition-colors",
        status === "applied" && "border-success/30",
        status === "failed" && "border-destructive/30",
      )}
    >
      <div className="flex items-center gap-2 border-b bg-muted/60 px-3 py-1.5">
        <button type="button" onClick={() => setExpanded((e) => !e)} className="text-muted-foreground" aria-label="Toggle diff">
          <ChevronDown className={cn("size-3.5 transition-transform", !expanded && "-rotate-90")} />
        </button>
        {isNew ? <FilePlus2 className="size-3.5 text-brand" /> : <FileText className="size-3.5 text-muted-foreground" />}
        <button type="button" onClick={onOpenFile} className="min-w-0 truncate font-medium font-mono text-xs hover:underline">
          {block.file}
        </button>
        <span className="font-mono text-[11px] tabular-nums">
          <span className="text-success-foreground">+{adds}</span> <span className="text-destructive-foreground">−{dels}</span>
        </span>
        <div className="ml-auto flex items-center gap-1">
          {!block.complete || pending ? (
            <span className="flex items-center gap-1.5 text-muted-foreground text-xs">
              <Spinner className="size-3" /> {block.complete ? "waiting for reply" : "writing"}
            </span>
          ) : status === "applied" ? (
            <>
              <span className="flex items-center gap-1 font-medium text-success-foreground text-xs">
                <Check className="size-3.5" /> Applied
              </span>
              {onUndo && (
                <Button variant="ghost" size="xs" onClick={onUndo}>
                  <Undo2 /> Undo
                </Button>
              )}
            </>
          ) : status === "rejected" ? (
            <span className="text-muted-foreground text-xs">Dismissed</span>
          ) : (
            <>
              <Button variant="ghost" size="xs" onClick={onReject}>
                <X /> Dismiss
              </Button>
              <Button variant="brand" size="xs" onClick={onApply}>
                <Check /> {status === "failed" ? "Retry" : "Apply"}
              </Button>
            </>
          )}
        </div>
      </div>
      {status === "failed" && failReason && (
        <div className="flex items-start gap-1.5 border-b bg-destructive/6 px-3 py-1.5 text-destructive-foreground text-xs">
          <TriangleAlert className="mt-0.5 size-3.5 shrink-0" /> {failReason}
        </div>
      )}
      {expanded && (
        <div className="max-h-80 overflow-auto py-1 font-mono text-[11.5px] leading-[1.55]">
          {lines.map((l, i) =>
            l.kind === "gap" ? (
              <div key={i} className="px-3 py-0.5 text-[10.5px] text-muted-foreground/70">
                {l.text ? `··· ${l.text}` : "···"}
              </div>
            ) : (
              <div
                key={i}
                className={cn(
                  "flex whitespace-pre-wrap break-all px-3",
                  l.kind === "add" && "bg-success/10 text-foreground",
                  l.kind === "del" && "bg-destructive/8 text-foreground/70 line-through decoration-destructive/40",
                  l.kind === "ctx" && "text-muted-foreground",
                )}
              >
                <span className="w-4 shrink-0 select-none opacity-60">{l.kind === "add" ? "+" : l.kind === "del" ? "−" : " "}</span>
                <span className="min-w-0">{l.text || " "}</span>
              </div>
            ),
          )}
        </div>
      )}
    </div>
  );
}
