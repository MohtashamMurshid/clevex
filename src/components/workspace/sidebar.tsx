"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  BookMarked,
  ExternalLink,
  FileCode2,
  FileImage,
  FileText,
  Hash,
  MoreHorizontal,
  Plus,
  Quote,
  Search,
  Star,
  Trash2,
  Upload,
  PenLine,
  Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Menu, MenuItem, MenuPopup, MenuSeparator, MenuTrigger } from "@/components/ui/menu";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsList, TabsPanel, TabsTab } from "@/components/ui/tabs";
import { toastManager } from "@/components/ui/toast";
import { Tooltip, TooltipPopup, TooltipTrigger } from "@/components/ui/tooltip";
import { citeKey, searchArxiv, toBibtex, type ArxivPaper } from "@/lib/arxiv";
import { collectBibKeys, parseOutline, wordCount } from "@/lib/latex/outline";
import type { ProjectFile } from "@/lib/types";
import { cn } from "@/lib/utils";
import { readUploads } from "@/lib/zip";

type Props = {
  files: ProjectFile[];
  activeFile: string;
  mainFile: string;
  onOpen: (path: string, line?: number) => void;
  onCreate: (path: string, content?: string) => void;
  onUpload: (files: { path: string; content?: string; data?: string; mime?: string }[]) => void;
  onRename: (from: string, to: string) => void;
  onDelete: (path: string) => void;
  onSetMain: (path: string) => void;
  onAppendBib: (entry: string) => string;
  onInsert: (text: string) => void;
};

function iconFor(path: string) {
  if (/\.(png|jpe?g|gif|svg|pdf|eps)$/i.test(path)) return FileImage;
  if (/\.(bib)$/i.test(path)) return BookMarked;
  if (/\.(sty|cls|bst)$/i.test(path)) return FileCode2;
  return FileText;
}

export function Sidebar(props: Props) {
  return (
    <div className="flex h-full min-h-0 flex-col bg-sidebar text-sidebar-foreground">
      <Tabs defaultValue="files" className="flex min-h-0 flex-1 flex-col gap-0">
        <div className="shrink-0 border-b px-2 py-1.5">
          <TabsList className="w-full" size="sm">
            <TabsTab value="files" className="flex-1">
              Files
            </TabsTab>
            <TabsTab value="outline" className="flex-1">
              Outline
            </TabsTab>
            <TabsTab value="cite" className="flex-1">
              Cite
            </TabsTab>
          </TabsList>
        </div>
        <TabsPanel value="files" className="min-h-0 flex-1">
          <FilesTab {...props} />
        </TabsPanel>
        <TabsPanel value="outline" className="min-h-0 flex-1">
          <OutlineTab {...props} />
        </TabsPanel>
        <TabsPanel value="cite" className="min-h-0 flex-1">
          <CiteTab {...props} />
        </TabsPanel>
      </Tabs>
    </div>
  );
}

function FilesTab({ files, activeFile, mainFile, onOpen, onCreate, onUpload, onRename, onDelete, onSetMain }: Props) {
  const [creating, setCreating] = useState(false);
  const [renaming, setRenaming] = useState<string | null>(null);
  const upload = useRef<HTMLInputElement>(null);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center justify-between px-3 pt-2.5 pb-1">
        <span className="font-medium text-[11px] text-muted-foreground uppercase tracking-[0.08em]">Project</span>
        <div className="flex items-center">
          <Tooltip>
            <TooltipTrigger render={<Button variant="ghost" size="icon-xs" aria-label="New file" onClick={() => setCreating(true)} />}>
              <Plus />
            </TooltipTrigger>
            <TooltipPopup>New file</TooltipPopup>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger render={<Button variant="ghost" size="icon-xs" aria-label="Upload files" onClick={() => upload.current?.click()} />}>
              <Upload />
            </TooltipTrigger>
            <TooltipPopup>Upload files or a .zip</TooltipPopup>
          </Tooltip>
          <input
            ref={upload}
            type="file"
            multiple
            className="hidden"
            onChange={async (e) => {
              if (e.target.files?.length) onUpload(await readUploads(e.target.files));
              e.target.value = "";
            }}
          />
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-1.5 pb-3">
        {creating && (
          <NameInput
            initial="section.tex"
            onDone={(name) => {
              setCreating(false);
              if (!name) return;
              if (files.some((f) => f.path === name)) {
                toastManager.add({ type: "error", title: `${name} already exists` });
                return;
              }
              onCreate(name);
            }}
          />
        )}
        {files.map((f) => {
          const Icon = iconFor(f.path);
          const depth = f.path.split("/").length - 1;
          if (renaming === f.path) {
            return (
              <NameInput
                key={f.path}
                initial={f.path}
                onDone={(name) => {
                  setRenaming(null);
                  if (name && name !== f.path) onRename(f.path, name);
                }}
              />
            );
          }
          return (
            <div
              key={f.path}
              className={cn(
                "group flex h-7 items-center gap-1.5 rounded-md pr-1 text-[13px] transition-colors",
                f.path === activeFile ? "bg-sidebar-accent text-sidebar-accent-foreground" : "hover:bg-sidebar-accent/60",
              )}
              style={{ paddingLeft: 8 + depth * 10 }}
            >
              <button type="button" className="flex min-w-0 flex-1 items-center gap-1.5 text-left" onClick={() => onOpen(f.path)}>
                <Icon className={cn("size-3.5 shrink-0", f.path === activeFile ? "text-brand" : "text-muted-foreground")} />
                <span className="truncate">{f.path.split("/").pop()}</span>
                {f.path === mainFile && <Star className="size-3 shrink-0 fill-sun text-sun" aria-label="Main file" />}
              </button>
              <Menu>
                <MenuTrigger
                  render={<Button variant="ghost" size="icon-xs" aria-label={`Actions for ${f.path}`} className="opacity-0 group-hover:opacity-100 data-popup-open:opacity-100" />}
                >
                  <MoreHorizontal />
                </MenuTrigger>
                <MenuPopup align="start">
                  <MenuItem onClick={() => setRenaming(f.path)}>
                    <PenLine /> Rename
                  </MenuItem>
                  {f.path.endsWith(".tex") && f.path !== mainFile && (
                    <MenuItem onClick={() => onSetMain(f.path)}>
                      <Star /> Set as main file
                    </MenuItem>
                  )}
                  <MenuSeparator />
                  <MenuItem
                    variant="destructive"
                    disabled={f.path === mainFile}
                    onClick={() => confirm(`Delete ${f.path}?`) && onDelete(f.path)}
                  >
                    <Trash2 /> Delete
                  </MenuItem>
                </MenuPopup>
              </Menu>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function NameInput({ initial, onDone }: { initial: string; onDone: (name: string | null) => void }) {
  const [v, setV] = useState(initial);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.focus();
    const dot = initial.lastIndexOf(".");
    el.setSelectionRange(initial.lastIndexOf("/") + 1, dot > 0 ? dot : initial.length);
  }, [initial]);
  const clean = (s: string) => s.trim().replace(/^\/+/, "").replace(/\.\.+/g, ".");
  return (
    <div className="flex items-center gap-1 px-1 py-0.5">
      <Input
        ref={ref}
        size="sm"
        value={v}
        onChange={(e) => setV(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") onDone(clean(v) || null);
          if (e.key === "Escape") onDone(null);
        }}
        onBlur={() => onDone(clean(v) || null)}
        className="font-mono text-xs"
      />
    </div>
  );
}

function OutlineTab({ files, mainFile, onOpen }: Props) {
  const items = useMemo(() => {
    const tex = files.filter((f) => f.path.endsWith(".tex") && f.content !== undefined);
    const ordered = [...tex.filter((f) => f.path === mainFile), ...tex.filter((f) => f.path !== mainFile)];
    return ordered.flatMap((f) => parseOutline(f.content!, f.path));
  }, [files, mainFile]);
  const words = useMemo(
    () => files.filter((f) => f.path.endsWith(".tex")).reduce((n, f) => n + wordCount(f.content ?? ""), 0),
    [files],
  );
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto px-1.5 py-2">
        {items.length === 0 ? (
          <p className="px-2 py-4 text-muted-foreground text-xs">Add \section&#123;…&#125; headings to see an outline.</p>
        ) : (
          items.map((it, i) => (
            <button
              type="button"
              key={i}
              onClick={() => onOpen(it.file, it.line)}
              className="flex w-full items-center gap-1.5 rounded-md py-1 pr-2 text-left text-[13px] hover:bg-sidebar-accent"
              style={{ paddingLeft: 8 + Math.max(0, it.level - 1) * 12 }}
            >
              {it.level <= 2 ? <Hash className="size-3 shrink-0 text-brand/70" /> : <span className="w-3 shrink-0" />}
              <span className={cn("truncate", it.level <= 2 ? "font-medium" : "text-muted-foreground")}>{it.title}</span>
            </button>
          ))
        )}
      </div>
      <div className="shrink-0 border-t px-3 py-2 text-muted-foreground text-xs tabular-nums">
        ≈ {words.toLocaleString()} words
      </div>
    </div>
  );
}

function CiteTab({ files, onAppendBib, onInsert }: Props) {
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<ArxivPaper[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const bibKeys = useMemo(() => new Set(files.flatMap((f) => (f.path.endsWith(".bib") ? collectBibKeys(f.content ?? "") : []))), [files]);
  const abort = useRef<AbortController | null>(null);

  const run = async () => {
    if (!q.trim()) return;
    abort.current?.abort();
    const c = new AbortController();
    abort.current = c;
    setLoading(true);
    setError(null);
    try {
      setResults(await searchArxiv(q, c.signal));
    } catch (e) {
      if ((e as Error).name !== "AbortError") setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 p-2">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 z-10 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            size="sm"
            value={q}
            placeholder="Search arXiv by topic or ID"
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && run()}
            className="*:data-[slot=input]:ps-8"
          />
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
        {loading && (
          <div className="flex items-center gap-2 px-1 py-3 text-muted-foreground text-xs">
            <Spinner className="size-3.5" /> Searching arXiv…
          </div>
        )}
        {error && <p className="px-1 py-2 text-destructive-foreground text-xs">{error}</p>}
        {!loading && results?.length === 0 && <p className="px-1 py-3 text-muted-foreground text-xs">No papers found.</p>}
        {!results && !loading && (
          <div className="px-1 py-3 text-muted-foreground text-xs leading-relaxed">
            Find papers on arXiv and add them to your bibliography in one click. Then use
            <code className="mx-1 rounded bg-muted px-1">\cite</code>— keys autocomplete in the editor.
          </div>
        )}
        <div className="space-y-2">
          {results?.map((p) => {
            const key = citeKey(p);
            const added = bibKeys.has(key);
            return (
              <div key={p.id} className="rounded-lg border bg-card p-2.5">
                <div className="font-medium text-[13px] leading-snug">{p.title}</div>
                <div className="mt-1 line-clamp-1 text-muted-foreground text-xs">
                  {p.authors.slice(0, 3).join(", ")}
                  {p.authors.length > 3 ? " et al." : ""} · {p.published.slice(0, 4)}
                </div>
                <div className="mt-2 flex items-center gap-1">
                  <Button
                    size="xs"
                    variant={added ? "secondary" : "outline"}
                    onClick={() => {
                      if (!added) {
                        const where = onAppendBib(toBibtex(p));
                        toastManager.add({ type: "success", title: "Added to bibliography", description: `${key} → ${where}` });
                      }
                    }}
                  >
                    {added ? <Check /> : <Plus />} {added ? "In .bib" : "Add to .bib"}
                  </Button>
                  <Button
                    size="xs"
                    variant="ghost"
                    onClick={() => {
                      if (!added) onAppendBib(toBibtex(p));
                      onInsert(`\\cite{${key}}`);
                    }}
                  >
                    <Quote /> Cite
                  </Button>
                  <a
                    href={p.url}
                    target="_blank"
                    rel="noreferrer"
                    className="ml-auto inline-flex size-6 items-center justify-center rounded-md text-muted-foreground hover:bg-accent"
                    aria-label="Open on arXiv"
                  >
                    <ExternalLink className="size-3.5" />
                  </a>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
