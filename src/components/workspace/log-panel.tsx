"use client";

import { useState } from "react";
import { ChevronUp, CircleAlert, CircleCheck, Sparkles, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { CompileResult } from "@/lib/types";
import { cn } from "@/lib/utils";

export function LogPanel({
  result,
  onJump,
  onFix,
}: {
  result: CompileResult | null;
  onJump: (file: string | undefined, line: number) => void;
  onFix: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [raw, setRaw] = useState(false);
  if (!result) return null;
  const errors = result.errors.filter((e) => e.level === "error");
  const warnings = result.errors.filter((e) => e.level === "warning");
  const failed = !result.ok;

  return (
    <div className={cn("shrink-0 border-t bg-card", open && "flex h-[42%] min-h-40 flex-col")}>
      <div className="flex h-9 shrink-0 items-center gap-2 whitespace-nowrap px-3 text-xs">
        <button type="button" onClick={() => setOpen((o) => !o)} className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden text-left">
          {failed ? (
            <CircleAlert className="size-3.5 shrink-0 text-destructive-foreground" />
          ) : (
            <CircleCheck className="size-3.5 shrink-0 text-success-foreground" />
          )}
          <span className={cn("shrink-0 font-medium", failed ? "text-destructive-foreground" : "text-foreground")}>
            {failed ? `${errors.length || 1} error${errors.length > 1 ? "s" : ""}` : "Compiled"}
          </span>
          {warnings.length > 0 && (
            <span className="flex shrink-0 items-center gap-1 text-muted-foreground">
              <TriangleAlert className="size-3 text-warning" /> {warnings.length} warning{warnings.length > 1 ? "s" : ""}
            </span>
          )}
          <span className="truncate text-muted-foreground">
            · {result.engine.replace("remote:", "cloud ")} · {(result.durationMs / 1000).toFixed(1)}s
          </span>
          <ChevronUp className={cn("ml-auto size-3.5 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} />
        </button>
        {failed && (
          <Button size="xs" variant="brand" onClick={onFix}>
            <Sparkles /> Fix with AI
          </Button>
        )}
      </div>
      {open && (
        <div className="flex min-h-0 flex-1 flex-col border-t">
          <div className="flex shrink-0 gap-1 px-2 pt-1.5">
            <button
              type="button"
              onClick={() => setRaw(false)}
              className={cn("rounded-md px-2 py-0.5 text-xs", !raw ? "bg-accent font-medium" : "text-muted-foreground")}
            >
              Problems
            </button>
            <button
              type="button"
              onClick={() => setRaw(true)}
              className={cn("rounded-md px-2 py-0.5 text-xs", raw ? "bg-accent font-medium" : "text-muted-foreground")}
            >
              Raw log
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-auto p-1.5">
            {raw ? (
              <pre className="whitespace-pre-wrap px-1.5 font-mono text-[11px] text-muted-foreground leading-relaxed">
                {result.log || "(empty)"}
              </pre>
            ) : result.errors.length === 0 ? (
              <p className="px-2 py-2 text-muted-foreground text-xs">No problems found.</p>
            ) : (
              result.errors.map((e, i) => (
                <button
                  type="button"
                  key={i}
                  onClick={() => e.line && onJump(e.file, e.line)}
                  className="flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left text-xs hover:bg-accent"
                >
                  {e.level === "error" ? (
                    <CircleAlert className="mt-0.5 size-3.5 shrink-0 text-destructive-foreground" />
                  ) : (
                    <TriangleAlert className="mt-0.5 size-3.5 shrink-0 text-warning" />
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="break-words">{e.message}</span>
                    {e.context && <code className="ml-1 rounded bg-muted px-1 font-mono text-[11px]">{e.context}</code>}
                  </span>
                  {e.line && (
                    <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
                      {e.file ?? ""}:{e.line}
                    </span>
                  )}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
