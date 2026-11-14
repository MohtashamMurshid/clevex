"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Group, Panel, Separator, type PanelImperativeHandle } from "react-resizable-panels";
import {
  ChevronDown,
  ChevronLeft,
  Code2,
  FileArchive,
  FileDown,
  MessageSquareText,
  MoreHorizontal,
  PanelLeft,
  Play,
  ScrollText,
  Sparkles,
  Zap,
  ZapOff,
} from "lucide-react";
import { CleveMark } from "@/components/brand";
import { ConnectDialog, ConnectionPills } from "@/components/connect-dialog";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { Menu, MenuGroup, MenuGroupLabel, MenuItem, MenuPopup, MenuRadioGroup, MenuRadioItem, MenuSeparator, MenuTrigger } from "@/components/ui/menu";
import { Spinner } from "@/components/ui/spinner";
import { toastManager } from "@/components/ui/toast";
import { Tooltip, TooltipPopup, TooltipTrigger } from "@/components/ui/tooltip";
import { useMediaQuery } from "@/hooks/use-media-query";
import { fixErrorsPrompt } from "@/lib/ai/prompts";
import {
  deleteFile,
  getProject,
  listFiles,
  loadPdf,
  putFile,
  renameFile,
  saveProject,
  savePdf,
  touchProject,
} from "@/lib/db";
import { collectBibKeys, collectLabels } from "@/lib/latex/outline";
import { updateSettings, useSettings } from "@/lib/settings";
import type { CompileResult, Project, ProjectFile, ProviderId } from "@/lib/types";
import { cn } from "@/lib/utils";
import { downloadBytes, base64ToBytes, zipProject } from "@/lib/zip";
import { ChatPanel, type ExternalPrompt } from "./chat-panel";
import { InlineAI, type InlineTarget } from "./inline-ai";
import { LatexEditor, type EditorHandle } from "./latex-editor";
import { LogPanel } from "./log-panel";
import { PdfViewer } from "./pdf-viewer";
import { Sidebar } from "./sidebar";

type MobilePane = "code" | "pdf" | "chat";

export function Workspace({ projectId }: { projectId: string }) {
  const router = useRouter();
  const settings = useSettings();
  const isDesktop = useMediaQuery("(min-width: 900px)");
  const [project, setProject] = useState<Project | null>(null);
  const [files, setFiles] = useState<ProjectFile[]>([]);
  const [active, setActive] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [compiling, setCompiling] = useState(false);
  const [result, setResult] = useState<CompileResult | null>(null);
  const [pdf, setPdf] = useState<string | undefined>();
  const [chatOpen, setChatOpen] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [connect, setConnect] = useState<{ open: boolean; provider: ProviderId }>({ open: false, provider: "claude" });
  const [inline, setInline] = useState<InlineTarget | null>(null);
  const [external, setExternal] = useState<ExternalPrompt | null>(null);
  const [cursorLine, setCursorLine] = useState(1);
  const [mobilePane, setMobilePane] = useState<MobilePane>("code");
  const [editingName, setEditingName] = useState(false);

  const editor = useRef<EditorHandle>(null);
  const filesRef = useRef<ProjectFile[]>([]);
  const projectRef = useRef<Project | null>(null);
  useLayoutEffect(() => {
    filesRef.current = files;
    projectRef.current = project;
  }, [files, project]);
  const saveTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const compileTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const compileSeq = useRef(0);
  const dirtySinceCompile = useRef(false);
  const sidebarPanel = useRef<PanelImperativeHandle>(null);
  const chatPanel = useRef<PanelImperativeHandle>(null);

  // ---------- Load ----------
  useEffect(() => {
    let alive = true;
    (async () => {
      const p = await getProject(projectId);
      if (!alive) return;
      if (!p) {
        router.replace("/app");
        return;
      }
      const fs = await listFiles(projectId);
      const stored = await loadPdf(projectId);
      if (!alive) return;
      setProject(p);
      setFiles(fs);
      setActive(fs.find((f) => f.path === p.mainFile)?.path ?? fs.find((f) => f.content !== undefined)?.path ?? "");
      if (stored) setPdf(stored);
      setLoading(false);
      document.title = `${p.name} · clevex`;
    })();
    return () => {
      alive = false;
    };
  }, [projectId, router]);

  // ---------- Compile ----------
  const compile = useCallback(async () => {
    const p = projectRef.current;
    if (!p) return;
    const seq = ++compileSeq.current;
    dirtySinceCompile.current = false;
    setCompiling(true);
    try {
      const res = await fetch("/api/compile", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          main: p.mainFile,
          engine: p.compiler === "tectonic" ? "pdflatex" : p.compiler,
          files: filesRef.current.map((f) => ({ path: f.path, content: f.content, data: f.data })),
        }),
      });
      const j = await res.json();
      if (seq !== compileSeq.current) return;
      if (!res.ok) throw new Error(j.error || `Compile failed (${res.status})`);
      const r = j as CompileResult;
      setResult(r);
      if (r.pdf) {
        setPdf(r.pdf);
        savePdf(p.id, r.pdf);
      }
    } catch (e) {
      if (seq !== compileSeq.current) return;
      const message = e instanceof Error ? e.message : String(e);
      setResult({ ok: false, log: message, errors: [{ level: "error", message }], engine: "none", durationMs: 0 });
    } finally {
      if (seq === compileSeq.current) setCompiling(false);
    }
  }, []);

  // First compile when the project opens without a cached PDF.
  const didInitialCompile = useRef(false);
  useEffect(() => {
    if (loading || didInitialCompile.current) return;
    didInitialCompile.current = true;
    compile();
  }, [loading, compile]);

  const scheduleCompile = useCallback(() => {
    dirtySinceCompile.current = true;
    if (!settings.autoCompile) return;
    if (compileTimer.current) clearTimeout(compileTimer.current);
    compileTimer.current = setTimeout(() => compile(), 1800);
  }, [settings.autoCompile, compile]);

  // ---------- File ops ----------
  const writeFile = useCallback(
    (path: string, content: string) => {
      const now = Date.now();
      setFiles((fs) => {
        const exists = fs.some((f) => f.path === path);
        const next = exists
          ? fs.map((f) => (f.path === path ? { ...f, content, updatedAt: now } : f))
          : [...fs, { path, content, updatedAt: now }].sort((a, b) => a.path.localeCompare(b.path));
        filesRef.current = next;
        return next;
      });
      const timers = saveTimers.current;
      const t = timers.get(path);
      if (t) clearTimeout(t);
      timers.set(
        path,
        setTimeout(() => {
          putFile(projectId, { path, content, updatedAt: now });
          touchProject(projectId);
          timers.delete(path);
        }, 350),
      );
      scheduleCompile();
    },
    [projectId, scheduleCompile],
  );

  // Flush pending saves when leaving.
  useEffect(() => {
    const flush = () => {
      for (const [path, t] of saveTimers.current) {
        clearTimeout(t);
        const f = filesRef.current.find((x) => x.path === path);
        if (f) putFile(projectId, f);
      }
      saveTimers.current.clear();
    };
    window.addEventListener("beforeunload", flush);
    return () => {
      window.removeEventListener("beforeunload", flush);
      flush();
    };
  }, [projectId]);

  const openFile = useCallback((path: string, line?: number) => {
    const f = filesRef.current.find((x) => x.path === path) ?? filesRef.current.find((x) => x.path.endsWith(`/${path}`));
    if (!f) return;
    if (f.content === undefined) {
      toastManager.add({ type: "info", title: `${f.path} is a binary file`, description: "It's included when compiling." });
      return;
    }
    setActive(f.path);
    setMobilePane("code");
    if (line) setTimeout(() => editor.current?.goTo(line), 30);
  }, []);

  const activeFile = files.find((f) => f.path === active);
  const labels = useMemo(() => files.flatMap((f) => (f.path.endsWith(".tex") ? collectLabels(f.content ?? "") : [])), [files]);
  const bibKeys = useMemo(() => files.flatMap((f) => (f.path.endsWith(".bib") ? collectBibKeys(f.content ?? "") : [])), [files]);

  const appendBib = useCallback(
    (entry: string) => {
      const bib = filesRef.current.find((f) => f.path.endsWith(".bib"));
      const path = bib?.path ?? "refs.bib";
      writeFile(path, `${(bib?.content ?? "").replace(/\s*$/, "")}${bib?.content?.trim() ? "\n\n" : ""}${entry}`);
      if (!bib) {
        toastManager.add({
          type: "info",
          title: "Created refs.bib",
          description: "Add \\bibliography{refs} before \\end{document} to print references.",
        });
      }
      return path;
    },
    [writeFile],
  );

  // ---------- Inline AI ----------
  const openInline = useCallback(() => {
    const ed = editor.current;
    const view = ed?.view();
    if (!ed || !view || !activeFile?.content) return;
    const sel = ed.getSelection();
    const coords = ed.coordsAt(sel.to) ?? ed.coordsAt(sel.from);
    if (!coords) return;
    const doc = view.state.doc.toString();
    setInline({
      from: sel.from,
      to: sel.to,
      text: sel.text,
      file: active,
      top: coords.bottom,
      above: (ed.coordsAt(sel.from) ?? coords).top,
      left: coords.left,
      before: doc.slice(Math.max(0, sel.from - 3000), sel.from),
      after: doc.slice(sel.to, sel.to + 1500),
    });
  }, [active, activeFile?.content]);

  const fixWithAI = useCallback(() => {
    if (!result) return;
    setChatOpen(true);
    setMobilePane("chat");
    setExternal({ id: crypto.randomUUID(), text: fixErrorsPrompt(result.errors, result.log), label: "Fix the compile errors" });
  }, [result]);

  // Global shortcuts.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "s") {
        e.preventDefault();
        compile();
      } else if (mod && e.key.toLowerCase() === "j") {
        e.preventDefault();
        setChatOpen((o) => !o);
      } else if (mod && e.key.toLowerCase() === "b") {
        e.preventDefault();
        setSidebarOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [compile]);

  // Sync collapse state with panels.
  useEffect(() => {
    const p = sidebarPanel.current;
    if (!p) return;
    if (sidebarOpen && p.isCollapsed()) p.expand();
    if (!sidebarOpen && !p.isCollapsed()) p.collapse();
  }, [sidebarOpen]);
  useEffect(() => {
    const p = chatPanel.current;
    if (!p) return;
    if (chatOpen && p.isCollapsed()) p.expand();
    if (!chatOpen && !p.isCollapsed()) p.collapse();
  }, [chatOpen]);

  if (loading || !project) {
    return (
      <div className="grid h-dvh place-items-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <CleveMark className="h-10 w-auto animate-blob" blink />
          <Spinner className="size-4 text-muted-foreground" />
        </div>
      </div>
    );
  }

  const editorPane = (
    <div className="flex h-full min-h-0 min-w-0 flex-col bg-panel">
      <div className="flex h-10 shrink-0 items-center gap-1 border-b px-2">
        {isDesktop ? (
          <div className="flex min-w-0 items-center gap-1.5 px-1 font-mono text-[12.5px]">
            <Code2 className="size-3.5 shrink-0 text-muted-foreground" />
            <span className="truncate">{active || "No file"}</span>
            <span className="shrink-0 text-muted-foreground/70">:{cursorLine}</span>
          </div>
        ) : (
          <Menu>
            <MenuTrigger className="flex min-w-0 items-center gap-1.5 rounded-md px-1.5 py-1 font-mono text-[12.5px] hover:bg-accent">
              <Code2 className="size-3.5 shrink-0 text-muted-foreground" />
              <span className="truncate">{active || "No file"}</span>
              <ChevronDown className="size-3 shrink-0 opacity-60" />
            </MenuTrigger>
            <MenuPopup align="start">
              {files
                .filter((f) => f.content !== undefined)
                .map((f) => (
                  <MenuItem key={f.path} onClick={() => openFile(f.path)} className="font-mono text-xs">
                    {f.path}
                  </MenuItem>
                ))}
            </MenuPopup>
          </Menu>
        )}
        <div className="ml-auto flex items-center gap-1">
          <Tooltip>
            <TooltipTrigger render={<Button variant="ghost" size="xs" onClick={openInline} className="text-muted-foreground" />}>
              <Sparkles className="text-brand" /> Edit with AI <Kbd className="ml-0.5">⌘K</Kbd>
            </TooltipTrigger>
            <TooltipPopup>Select text, then press ⌘K to rewrite it. With no selection, it writes at the cursor.</TooltipPopup>
          </Tooltip>
        </div>
      </div>
      <div className="relative min-h-0 flex-1">
        {activeFile?.content !== undefined ? (
          <LatexEditor
            ref={editor}
            fileKey={active}
            value={activeFile.content}
            onChange={(v) => writeFile(active, v)}
            onCompile={compile}
            onInlineAI={openInline}
            onCursor={setCursorLine}
            diagnostics={result?.errors ?? []}
            labels={labels}
            bibKeys={bibKeys}
            fontSize={settings.editorFontSize}
          />
        ) : (
          <div className="grid h-full place-items-center text-muted-foreground text-sm">Pick a file to edit.</div>
        )}
      </div>
      <LogPanel result={result} onJump={(file, line) => (file ? openFile(file, line) : editor.current?.goTo(line))} onFix={fixWithAI} />
    </div>
  );

  const pdfPane = (
    <PdfViewer
      pdf={pdf}
      compiling={compiling}
      onDownload={() => pdf && downloadBytes(base64ToBytes(pdf), `${project.name}.pdf`, "application/pdf")}
      emptyHint={result && !result.ok ? "Fix the errors below, then recompile." : "Press ⌘S to compile."}
    />
  );

  const chatPane = (
    <ChatPanel
      projectId={project.id}
      files={files}
      mainFile={project.mainFile}
      activeFile={active}
      errors={result?.errors ?? []}
      getEditorState={() => ({ selection: editor.current?.getSelection().text ?? "", cursorLine })}
      writeFile={writeFile}
      openFile={(p) => openFile(p)}
      onConnect={(provider) => setConnect({ open: true, provider })}
      externalPrompt={external}
      onClose={isDesktop ? () => setChatOpen(false) : undefined}
    />
  );

  const sidebar = (
    <Sidebar
      files={files}
      activeFile={active}
      mainFile={project.mainFile}
      onOpen={openFile}
      onCreate={(path, content) => {
        writeFile(path, content ?? (path.endsWith(".tex") ? `% ${path}\n` : ""));
        putFile(project.id, { path, content: content ?? "", updatedAt: Date.now() });
        setActive(path);
      }}
      onUpload={async (incoming) => {
        const now = Date.now();
        for (const f of incoming) await putFile(project.id, { ...f, updatedAt: now });
        setFiles(await listFiles(project.id));
        toastManager.add({ type: "success", title: `Added ${incoming.length} file${incoming.length > 1 ? "s" : ""}` });
        scheduleCompile();
      }}
      onRename={async (from, to) => {
        await renameFile(project.id, from, to);
        setFiles(await listFiles(project.id));
        if (active === from) setActive(to);
        if (project.mainFile === from) {
          const p = { ...project, mainFile: to };
          setProject(p);
          saveProject(p);
        }
      }}
      onDelete={async (path) => {
        await deleteFile(project.id, path);
        setFiles((fs) => fs.filter((f) => f.path !== path));
        if (active === path) setActive(project.mainFile);
      }}
      onSetMain={(path) => {
        const p = { ...project, mainFile: path, updatedAt: Date.now() };
        setProject(p);
        saveProject(p);
        scheduleCompile();
      }}
      onAppendBib={appendBib}
      onInsert={(text) => editor.current?.insertAtCursor(text)}
    />
  );

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-background">
      {/* Top bar */}
      <header className="flex h-12 shrink-0 items-center gap-2 border-b bg-background px-2.5">
        <Link href="/app" className="group flex items-center gap-1 rounded-lg px-1.5 py-1 hover:bg-accent" aria-label="All projects">
          <ChevronLeft className="size-3.5 text-muted-foreground transition-transform group-hover:-translate-x-0.5" />
          <CleveMark className="h-5 w-auto" />
        </Link>
        {isDesktop && (
          <Tooltip>
            <TooltipTrigger
              render={
                <Button variant="ghost" size="icon-sm" aria-label="Toggle sidebar" onClick={() => setSidebarOpen((o) => !o)} />
              }
            >
              <PanelLeft />
            </TooltipTrigger>
            <TooltipPopup>
              Toggle files <Kbd>⌘B</Kbd>
            </TooltipPopup>
          </Tooltip>
        )}
        <div className="min-w-0">
          {editingName ? (
            <input
              autoFocus
              defaultValue={project.name}
              onBlur={(e) => {
                const name = e.target.value.trim() || project.name;
                const p = { ...project, name, updatedAt: Date.now() };
                setProject(p);
                saveProject(p);
                setEditingName(false);
                document.title = `${name} · clevex`;
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                if (e.key === "Escape") setEditingName(false);
              }}
              className="h-7 w-56 rounded-md border bg-background px-2 font-medium text-sm outline-none focus:border-ring"
            />
          ) : (
            <button
              type="button"
              onClick={() => setEditingName(true)}
              className="max-w-[40vw] truncate rounded-md px-1.5 py-1 font-medium text-sm hover:bg-accent"
              title="Rename"
            >
              {project.name}
            </button>
          )}
        </div>

        <div className="ml-auto flex items-center gap-1.5">
          {isDesktop && <ConnectionPills onOpen={(provider) => setConnect({ open: true, provider })} />}
          <Menu>
            <MenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label="More" />}>
              <MoreHorizontal />
            </MenuTrigger>
            <MenuPopup align="end" className="w-60">
              <MenuItem onClick={() => pdf && downloadBytes(base64ToBytes(pdf), `${project.name}.pdf`, "application/pdf")} disabled={!pdf}>
                <FileDown /> Download PDF
              </MenuItem>
              <MenuItem
                onClick={() =>
                  downloadBytes(zipProject(files, pdf, `${project.mainFile.replace(/\.tex$/, "")}.pdf`), `${project.name}.zip`, "application/zip")
                }
              >
                <FileArchive /> Export project (.zip)
              </MenuItem>
              <MenuSeparator />
              <MenuGroup>
                <MenuGroupLabel>Engine (cloud compile)</MenuGroupLabel>
                <MenuRadioGroup
                  value={project.compiler}
                  onValueChange={(v) => {
                    const p = { ...project, compiler: v as Project["compiler"] };
                    setProject(p);
                    saveProject(p);
                  }}
                >
                  <MenuRadioItem value="pdflatex">pdfLaTeX</MenuRadioItem>
                  <MenuRadioItem value="xelatex">XeLaTeX</MenuRadioItem>
                  <MenuRadioItem value="lualatex">LuaLaTeX</MenuRadioItem>
                </MenuRadioGroup>
              </MenuGroup>
              <MenuSeparator />
              <MenuItem onClick={() => updateSettings({ autoCompile: !settings.autoCompile })}>
                {settings.autoCompile ? <ZapOff /> : <Zap />} {settings.autoCompile ? "Turn off auto-compile" : "Turn on auto-compile"}
              </MenuItem>
              <MenuItem onClick={() => updateSettings({ editorFontSize: Math.min(18, settings.editorFontSize + 1) })}>
                <ScrollText /> Larger editor text
              </MenuItem>
              <MenuItem onClick={() => updateSettings({ editorFontSize: Math.max(11, settings.editorFontSize - 1) })}>
                <ScrollText /> Smaller editor text
              </MenuItem>
            </MenuPopup>
          </Menu>
          <ThemeToggle />
          {isDesktop && (
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    variant={chatOpen ? "secondary" : "ghost"}
                    size="icon-sm"
                    aria-label="Toggle AI chat"
                    onClick={() => setChatOpen((o) => !o)}
                  />
                }
              >
                <MessageSquareText />
              </TooltipTrigger>
              <TooltipPopup>
                AI chat <Kbd>⌘J</Kbd>
              </TooltipPopup>
            </Tooltip>
          )}
          <Button variant="brand" size="sm" onClick={compile} loading={false} disabled={compiling} className="gap-1.5">
            {compiling ? <Spinner className="size-3.5" /> : <Play className="size-3.5 fill-current" />}
            <span className="hidden sm:inline">{compiling ? "Compiling" : "Compile"}</span>
            <Kbd className="hidden bg-white/20 text-current lg:inline-flex">⌘S</Kbd>
          </Button>
        </div>
      </header>

      {/* Body */}
      {isDesktop ? (
        <Group orientation="horizontal" className="min-h-0 flex-1">
          <Panel
            panelRef={sidebarPanel}
            defaultSize={216}
            minSize={180}
            maxSize={380}
            collapsible
            collapsedSize={0}
            onResize={(s) => setSidebarOpen(s.inPixels > 0)}
          >
            <div className="h-full border-r">{sidebar}</div>
          </Panel>
          <Separator className="w-px bg-border transition-colors hover:bg-brand/50 data-[separator=active]:bg-brand" />
          <Panel minSize={320}>{editorPane}</Panel>
          <Separator className="w-px bg-border transition-colors hover:bg-brand/50 data-[separator=active]:bg-brand" />
          <Panel minSize={300}>{pdfPane}</Panel>
          <Separator className="w-px bg-border transition-colors hover:bg-brand/50 data-[separator=active]:bg-brand" />
          <Panel
            panelRef={chatPanel}
            defaultSize={380}
            minSize={320}
            maxSize={640}
            collapsible
            collapsedSize={0}
            onResize={(s) => setChatOpen(s.inPixels > 0)}
          >
            <div className="h-full border-l">{chatPane}</div>
          </Panel>
        </Group>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1">
            {mobilePane === "code" ? editorPane : mobilePane === "pdf" ? pdfPane : chatPane}
          </div>
          <nav className="grid shrink-0 grid-cols-3 border-t bg-background pb-[env(safe-area-inset-bottom)]">
            {(
              [
                ["code", "Editor", Code2],
                ["pdf", "Preview", FileDown],
                ["chat", "AI", Sparkles],
              ] as const
            ).map(([id, label, Icon]) => (
              <button
                type="button"
                key={id}
                onClick={() => setMobilePane(id)}
                className={cn(
                  "flex h-12 flex-col items-center justify-center gap-0.5 text-[11px]",
                  mobilePane === id ? "text-brand" : "text-muted-foreground",
                )}
              >
                <Icon className="size-4" />
                {label}
              </button>
            ))}
          </nav>
        </div>
      )}

      {inline && (
        <InlineAI
          target={inline}
          files={files}
          mainFile={project.mainFile}
          onClose={() => {
            setInline(null);
            editor.current?.focus();
          }}
          onAccept={(text) => {
            if (inline.file === active) editor.current?.replaceRange(inline.from, inline.to, text);
            setInline(null);
          }}
        />
      )}

      <ConnectDialog open={connect.open} initial={connect.provider} onOpenChange={(open) => setConnect((c) => ({ ...c, open }))} />
    </div>
  );
}
