"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  BookOpenText,
  Copy,
  FileUp,
  MoreHorizontal,
  PenLine,
  Plus,
  Presentation,
  Sparkles,
  Trash2,
  FileText,
  NotebookPen,
} from "lucide-react";
import { CleveMark, ProviderGlyph, Wordmark } from "@/components/brand";
import { ConnectDialog, ConnectionPills } from "@/components/connect-dialog";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { Dialog, DialogFooter, DialogHeader, DialogPanel, DialogPopup, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Menu, MenuItem, MenuPopup, MenuSeparator, MenuTrigger } from "@/components/ui/menu";
import { Skeleton } from "@/components/ui/skeleton";
import { toastManager } from "@/components/ui/toast";
import { useCredentials } from "@/lib/auth/store";
import { createProject, deleteProject, listFiles, listProjects, saveProject } from "@/lib/db";
import { TEMPLATES } from "@/lib/templates";
import type { Project, ProviderId } from "@/lib/types";
import { cn } from "@/lib/utils";
import { guessMainFile, readUploads } from "@/lib/zip";

const TEMPLATE_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  paper: FileText,
  blank: PenLine,
  notes: NotebookPen,
  beamer: Presentation,
};

const ACCENTS = [
  "from-[#f9e4d8] to-[#f2c7b0] dark:from-[#522c1c] dark:to-[#713922]",
  "from-[#fbeec2] to-[#f6dc8b] dark:from-[#4a3c12] dark:to-[#5f4b12]",
  "from-[#e3ece3] to-[#c9dccb] dark:from-[#1d2c21] dark:to-[#2a3f2f]",
  "from-[#e2e9f3] to-[#c8d6ea] dark:from-[#1b2533] dark:to-[#26354b]",
  "from-[#eee8f3] to-[#dccfe8] dark:from-[#2a2133] dark:to-[#3a2c47]",
  "from-[#eeecea] to-[#dedcd9] dark:from-[#282624] dark:to-[#353230]",
];

function timeAgo(t: number) {
  const s = Math.round((Date.now() - t) / 1000);
  if (s < 60) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(t).toLocaleDateString();
}

export function Dashboard() {
  const router = useRouter();
  const creds = useCredentials();
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [connect, setConnect] = useState<{ open: boolean; provider: ProviderId }>({ open: false, provider: "chatgpt" });
  const [renaming, setRenaming] = useState<Project | null>(null);
  const [creating, setCreating] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const refresh = useCallback(() => listProjects().then(setProjects), []);
  useEffect(() => {
    refresh();
  }, [refresh]);

  const newFromTemplate = async (id: string) => {
    setCreating(id);
    const t = TEMPLATES.find((x) => x.id === id)!;
    const p = await createProject({
      name: id === "blank" ? "Untitled document" : t.name,
      template: id,
      files: t.files,
    });
    router.push(`/p/${p.id}`);
  };

  const importFiles = async (list: FileList | null) => {
    if (!list?.length) return;
    try {
      const files = await readUploads(list);
      if (!files.length) throw new Error("No files found");
      const main = guessMainFile(files);
      const first = list[0].name.replace(/\.(zip|tex)$/i, "");
      const p = await createProject({ name: first || "Imported project", template: "import", files, mainFile: main });
      router.push(`/p/${p.id}`);
    } catch (e) {
      toastManager.add({ type: "error", title: "Import failed", description: e instanceof Error ? e.message : String(e) });
    }
  };

  const duplicate = async (p: Project) => {
    const files = await listFiles(p.id);
    await createProject({ name: `${p.name} (copy)`, template: p.template, files, mainFile: p.mainFile });
    refresh();
  };

  const connectedCount = Number(!!creds.chatgpt) + Number(!!creds.claude);

  return (
    <div className="min-h-dvh bg-background">
      <header className="sticky top-0 z-20 border-b bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
          <Wordmark className="text-[17px]" />
          <div className="flex items-center gap-2">
            <div className="hidden sm:block">
              <ConnectionPills onOpen={(provider) => setConnect({ open: true, provider })} />
            </div>
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 pb-24 sm:px-6">
        {/* Hero */}
        <section className="relative grid gap-8 pt-12 pb-10 sm:pt-16 md:grid-cols-[1.25fr_1fr] md:items-end">
          <div>
            <p className="mb-4 inline-flex items-center gap-2 rounded-full border bg-card px-3 py-1 text-muted-foreground text-xs shadow-xs/5">
              <Sparkles className="size-3.5 text-brand" /> A cleave.ai side project
            </p>
            <h1 className="font-serif text-[2.6rem] leading-[1.05] tracking-[-0.02em] sm:text-[3.4rem]">
              Write papers with the AI <span className="text-brand italic">you already pay for</span>.
            </h1>
            <p className="mt-4 max-w-xl text-[15px] text-muted-foreground leading-relaxed">
              clevex is a LaTeX workspace with GPT and Claude built in. Draft, fix compile errors, find citations and
              turn whiteboard photos into equations, all on your own ChatGPT and Claude plans.
            </p>
            <div className="mt-6 flex flex-wrap items-center gap-2.5">
              <Button variant="brand" size="lg" loading={creating === "paper"} onClick={() => newFromTemplate("paper")}>
                <Plus /> New paper
              </Button>
              <Button variant="outline" size="lg" onClick={() => fileInput.current?.click()}>
                <FileUp /> Import .zip or .tex
              </Button>
              <input
                ref={fileInput}
                type="file"
                multiple
                accept=".zip,.tex,.bib,.cls,.sty,.png,.jpg,.jpeg,.pdf"
                className="hidden"
                onChange={(e) => {
                  importFiles(e.target.files);
                  e.target.value = "";
                }}
              />
            </div>
          </div>

          {/* Connect card */}
          <div className="relative overflow-hidden rounded-2xl border bg-card p-5 shadow-soft">
            <CleveMark className="absolute top-4 right-4 h-11 w-auto rotate-6" blink />
            <div className="font-medium text-sm">Your models</div>
            <p className="mt-1 max-w-[16rem] text-muted-foreground text-xs">
              {connectedCount === 2
                ? "Both subscriptions are connected. Pick any model from the chat panel."
                : "Connect at least one subscription to turn on the AI features."}
            </p>
            <div className="mt-4 space-y-2">
              {(["chatgpt", "claude"] as const).map((p) => {
                const on = !!creds[p];
                return (
                  <button
                    type="button"
                    key={p}
                    onClick={() => setConnect({ open: true, provider: p })}
                    className="flex w-full items-center gap-3 rounded-xl border bg-background/60 px-3 py-2.5 text-left transition-colors hover:bg-accent"
                  >
                    <span className="grid size-8 place-items-center rounded-lg border bg-card">
                      <ProviderGlyph provider={p} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium text-sm">{p === "chatgpt" ? "ChatGPT" : "Claude"}</span>
                      <span className="block truncate text-muted-foreground text-xs">
                        {on
                          ? (p === "chatgpt" ? creds.chatgpt?.email : creds.claude?.kind === "claude-oauth" ? creds.claude.email : "API key") ||
                            "Connected"
                          : p === "chatgpt"
                            ? "Plus, Pro or Business"
                            : "Pro or Max"}
                      </span>
                    </span>
                    {on ? (
                      <span className="rounded-full bg-success/12 px-2 py-0.5 font-medium text-[11px] text-success-foreground">
                        Connected
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 font-medium text-brand-strong text-xs">
                        Connect <ArrowRight className="size-3" />
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </section>

        {/* Templates */}
        <section className="mt-2">
          <h2 className="mb-3 font-medium text-muted-foreground text-xs uppercase tracking-[0.08em]">Start from a template</h2>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {TEMPLATES.map((t) => {
              const Icon = TEMPLATE_ICONS[t.id] ?? FileText;
              return (
                <button
                  type="button"
                  key={t.id}
                  onClick={() => newFromTemplate(t.id)}
                  disabled={!!creating}
                  className="group relative flex flex-col overflow-hidden rounded-2xl border bg-card text-left shadow-xs/5 transition-all hover:-translate-y-0.5 hover:shadow-soft disabled:opacity-60"
                >
                  <div className="relative h-28 bg-paper px-5 pt-4">
                    <div className="mx-auto h-full max-w-[9rem] rounded-t-md bg-white px-3 pt-3 shadow-[0_8px_24px_-12px_rgba(60,40,20,0.35)] transition-transform group-hover:-translate-y-1">
                      <div className="mx-auto h-1.5 w-2/3 rounded-full bg-neutral-800/80" />
                      <div className="mx-auto mt-1.5 h-1 w-1/3 rounded-full bg-neutral-400/70" />
                      <div className="mt-3 space-y-1">
                        {[92, 100, 84, 96, 70].map((w, i) => (
                          <div key={i} className="h-[3px] rounded-full bg-neutral-300" style={{ width: `${w}%` }} />
                        ))}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-start gap-2.5 p-3.5">
                    <Icon className="mt-0.5 size-4 shrink-0 text-brand" />
                    <div>
                      <div className="font-medium text-sm">{t.name}</div>
                      <div className="mt-0.5 line-clamp-2 text-muted-foreground text-xs">{t.blurb}</div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        {/* Projects */}
        <section className="mt-12">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-medium text-muted-foreground text-xs uppercase tracking-[0.08em]">Your projects</h2>
            {projects && projects.length > 0 && (
              <span className="text-muted-foreground text-xs">{projects.length} total</span>
            )}
          </div>
          {projects === null ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-36 rounded-2xl" />
              ))}
            </div>
          ) : projects.length === 0 ? (
            <div className="flex flex-col items-center rounded-2xl border border-dashed bg-card/50 px-6 py-14 text-center">
              <CleveMark className="h-12 w-auto animate-blob" blink />
              <div className="mt-4 font-medium">No projects yet</div>
              <p className="mt-1 max-w-sm text-muted-foreground text-sm">
                Start a new paper from a template, or import an existing LaTeX project as a .zip.
              </p>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {projects.map((p) => (
                <div
                  key={p.id}
                  className="group relative flex flex-col overflow-hidden rounded-2xl border bg-card shadow-xs/5 transition-all hover:-translate-y-0.5 hover:shadow-soft"
                >
                  <button type="button" onClick={() => router.push(`/p/${p.id}`)} className="text-left">
                    <div className={cn("relative h-20 bg-gradient-to-br", ACCENTS[p.accent % ACCENTS.length])}>
                      <BookOpenText className="absolute bottom-3 left-4 size-5 text-black/30 dark:text-white/40" />
                    </div>
                    <div className="p-4 pr-12">
                      <div className="truncate font-medium">{p.name}</div>
                      <div className="mt-0.5 text-muted-foreground text-xs">
                        {p.mainFile} · edited {timeAgo(p.updatedAt)}
                      </div>
                    </div>
                  </button>
                  <div className="absolute right-2.5 bottom-3">
                    <Menu>
                      <MenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label="Project actions" />}>
                        <MoreHorizontal />
                      </MenuTrigger>
                      <MenuPopup align="end">
                        <MenuItem onClick={() => setRenaming(p)}>
                          <PenLine /> Rename
                        </MenuItem>
                        <MenuItem onClick={() => duplicate(p)}>
                          <Copy /> Duplicate
                        </MenuItem>
                        <MenuSeparator />
                        <MenuItem
                          variant="destructive"
                          onClick={async () => {
                            if (!confirm(`Delete “${p.name}”? This can't be undone.`)) return;
                            await deleteProject(p.id);
                            refresh();
                          }}
                        >
                          <Trash2 /> Delete
                        </MenuItem>
                      </MenuPopup>
                    </Menu>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <footer className="mt-20 flex flex-wrap items-center justify-between gap-2 border-t pt-6 text-muted-foreground text-xs">
          <span className="inline-flex items-center gap-1.5">
            <CleveMark className="h-3.5 w-auto" /> clevex · by the cleave.ai team
          </span>
          <span>Projects are stored in this browser. Export a .zip from the editor to back them up.</span>
        </footer>
      </main>

      <ConnectDialog
        open={connect.open}
        initial={connect.provider}
        onOpenChange={(open) => setConnect((c) => ({ ...c, open }))}
      />
      <RenameDialog
        project={renaming}
        onClose={() => setRenaming(null)}
        onSave={async (name) => {
          if (!renaming) return;
          await saveProject({ ...renaming, name, updatedAt: Date.now() });
          setRenaming(null);
          refresh();
        }}
      />
    </div>
  );
}

function RenameDialog({
  project,
  onClose,
  onSave,
}: {
  project: Project | null;
  onClose: () => void;
  onSave: (name: string) => void;
}) {
  const [name, setName] = useState("");
  const [forId, setForId] = useState<string | null>(null);
  if ((project?.id ?? null) !== forId) {
    setForId(project?.id ?? null);
    setName(project?.name ?? "");
  }
  return (
    <Dialog open={!!project} onOpenChange={(o) => !o && onClose()}>
      <DialogPopup className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Rename project</DialogTitle>
        </DialogHeader>
        <DialogPanel>
          <Input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && name.trim() && onSave(name.trim())}
          />
        </DialogPanel>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="brand" disabled={!name.trim()} onClick={() => onSave(name.trim())}>
            Save
          </Button>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}
