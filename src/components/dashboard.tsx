"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery } from "convex/react";
import { ChevronDown, Copy, FileUp, HardDriveUpload, LogOut, MoreHorizontal, PenLine, Plus, Trash2, X } from "lucide-react";
import { api } from "../../convex/_generated/api";
import { CleveMark } from "@/components/brand";
import { ConnectDialog, ConnectionPills } from "@/components/connect-dialog";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { Dialog, DialogFooter, DialogHeader, DialogPanel, DialogPopup, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Menu, MenuItem, MenuPopup, MenuSeparator, MenuTrigger } from "@/components/ui/menu";
import { Skeleton } from "@/components/ui/skeleton";
import { toastManager } from "@/components/ui/toast";
import { authClient } from "@/lib/auth-client";
import { createProject, deleteProject, duplicateProject, saveProject } from "@/lib/db";
import { deleteLocalProject, listLocalFiles, listLocalProjects } from "@/lib/local-db";
import { TEMPLATES } from "@/lib/templates";
import type { Project, ProviderId } from "@/lib/types";
import { guessMainFile, readUploads } from "@/lib/zip";

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

/** A tiny paper thumbnail. */
function PagePreview({ title }: { title: string }) {
  return (
    <div className="h-full rounded-t-[3px] bg-white px-4 pt-4 shadow-[0_6px_20px_-10px_rgba(60,40,20,0.35)]">
      <div className="truncate text-center font-serif text-[11px] text-neutral-800">{title}</div>
      <div className="mx-auto mt-1 h-[3px] w-1/4 rounded-full bg-neutral-300" />
      <div className="mt-3 space-y-[5px]">
        {[100, 94, 100, 88, 97, 72].map((w, i) => (
          <div key={i} className="h-[3px] rounded-full bg-neutral-200" style={{ width: `${w}%` }} />
        ))}
      </div>
    </div>
  );
}

export function Dashboard() {
  const router = useRouter();
  const projects = useQuery(api.projects.list);
  const [connect, setConnect] = useState<{ open: boolean; provider: ProviderId }>({ open: false, provider: "chatgpt" });
  const [renaming, setRenaming] = useState<Project | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const [busy, setBusy] = useState<string | null>(null);

  const fail = (title: string, e: unknown) =>
    toastManager.add({ type: "error", title, description: e instanceof Error ? e.message : String(e) });

  const newFromTemplate = async (id: string) => {
    if (busy) return;
    setBusy(id);
    try {
      const t = TEMPLATES.find((x) => x.id === id)!;
      const p = await createProject({ name: id === "blank" ? "Untitled" : t.name, template: id, files: t.files });
      router.push(`/p/${p.id}`);
    } catch (e) {
      fail("Couldn't create the project", e);
      setBusy(null);
    }
  };

  const importFiles = async (list: FileList | null) => {
    if (!list?.length) return;
    try {
      const files = await readUploads(list);
      if (!files.length) throw new Error("No files found");
      const name = list[0].name.replace(/\.(zip|tex)$/i, "") || "Imported project";
      const p = await createProject({ name, template: "import", files, mainFile: guessMainFile(files) });
      router.push(`/p/${p.id}`);
    } catch (e) {
      toastManager.add({ type: "error", title: "Import failed", description: e instanceof Error ? e.message : String(e) });
    }
  };

  const duplicate = async (p: Project) => {
    try {
      await duplicateProject(p.id);
    } catch (e) {
      fail("Couldn't duplicate", e);
    }
  };

  return (
    <div className="min-h-dvh bg-background">
      <header className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2 font-semibold text-[17px] tracking-[-0.02em]">
          <CleveMark className="h-6 w-auto" />
          clevex
        </Link>
        <div className="flex items-center gap-2">
          <ConnectionPills onOpen={(provider) => setConnect({ open: true, provider })} />
          <ThemeToggle />
          <UserMenu />
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 pt-8 pb-24 sm:px-6 sm:pt-12">
        <div className="flex items-center justify-between gap-3">
          <h1 className="font-semibold text-2xl tracking-[-0.02em]">Projects</h1>
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={() => fileInput.current?.click()}>
              <FileUp /> Import
            </Button>
            <Menu>
              <MenuTrigger render={<Button variant="brand" />}>
                <Plus /> New <ChevronDown className="opacity-70" />
              </MenuTrigger>
              <MenuPopup align="end" className="w-56">
                {TEMPLATES.map((t) => (
                  <MenuItem key={t.id} onClick={() => newFromTemplate(t.id)}>
                    {t.name}
                  </MenuItem>
                ))}
              </MenuPopup>
            </Menu>
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

        <LocalImportBanner onImported={(id) => router.push(`/p/${id}`)} />

        {projects === undefined ? (
          <div className="mt-8 grid grid-cols-2 gap-4 md:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="aspect-[4/3] rounded-xl" />
            ))}
          </div>
        ) : projects.length === 0 ? (
          <div className="mt-8">
            <p className="text-muted-foreground text-sm">Start from a template.</p>
            <div className="mt-4 grid grid-cols-2 gap-4 md:grid-cols-4">
              {TEMPLATES.map((t) => (
                <button
                  type="button"
                  key={t.id}
                  onClick={() => newFromTemplate(t.id)}
                  disabled={!!busy}
                  className="group text-left disabled:opacity-60"
                >
                  <div className="aspect-[4/3] overflow-hidden rounded-xl border bg-paper px-5 pt-5 transition-transform group-hover:-translate-y-0.5">
                    <PagePreview title={t.name} />
                  </div>
                  <div className="mt-2.5 font-medium text-sm">{t.name}</div>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="mt-8 grid grid-cols-2 gap-x-4 gap-y-6 md:grid-cols-4">
            {projects.map((p) => (
              <div key={p.id} className="group relative">
                <Link href={`/p/${p.id}`} className="block">
                  <div className="aspect-[4/3] overflow-hidden rounded-xl border bg-paper px-5 pt-5 transition-transform group-hover:-translate-y-0.5">
                    <PagePreview title={p.name} />
                  </div>
                  <div className="mt-2.5 truncate pr-8 font-medium text-sm">{p.name}</div>
                  <div className="text-muted-foreground text-xs">{timeAgo(p.updatedAt)}</div>
                </Link>
                <div className="absolute right-0 bottom-1">
                  <Menu>
                    <MenuTrigger render={<Button variant="ghost" size="icon-xs" aria-label={`Actions for ${p.name}`} />}>
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
                          await deleteProject(p.id).catch((e) => fail("Couldn't delete", e));
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
          await saveProject({ ...renaming, name, updatedAt: Date.now() }).catch((e) => fail("Couldn't rename", e));
          setRenaming(null);
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

function UserMenu() {
  const user = useQuery(api.auth.getCurrentUser);
  if (!user) return null;
  const initial = (user.name || user.email || "?").trim()[0]?.toUpperCase();
  return (
    <Menu>
      <MenuTrigger
        aria-label="Account"
        className="grid size-8 place-items-center rounded-full bg-brand-subtle font-semibold text-brand-strong text-sm transition-shadow hover:ring-2 hover:ring-brand/30"
      >
        {initial}
      </MenuTrigger>
      <MenuPopup align="end" className="w-60">
        <div className="px-2 py-1.5">
          <div className="truncate font-medium text-sm">{user.name}</div>
          <div className="truncate text-muted-foreground text-xs">{user.email}</div>
        </div>
        <MenuSeparator />
        <MenuItem
          onClick={async () => {
            await authClient.signOut();
            // Full reload so the Convex client drops the old session.
            window.location.replace("/");
          }}
        >
          <LogOut /> Sign out
        </MenuItem>
      </MenuPopup>
    </Menu>
  );
}

/** Projects created before accounts existed live in this browser; offer to move them. */
function LocalImportBanner({ onImported }: { onImported: (id: string) => void }) {
  const [local, setLocal] = useState<Project[]>([]);
  const [busy, setBusy] = useState(false);
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    let alive = true;
    listLocalProjects().then((ps) => alive && setLocal(ps));
    return () => {
      alive = false;
    };
  }, []);
  if (hidden || local.length === 0) return null;

  const importAll = async () => {
    setBusy(true);
    let lastId: string | null = null;
    let moved = 0;
    for (const p of local) {
      try {
        const files = await listLocalFiles(p.id);
        const created = await createProject({
          name: p.name,
          template: p.template,
          mainFile: p.mainFile,
          compiler: p.compiler,
          files,
        });
        await deleteLocalProject(p.id);
        lastId = created.id;
        moved++;
      } catch (e) {
        toastManager.add({
          type: "error",
          title: `Couldn't move “${p.name}”`,
          description: e instanceof Error ? e.message : String(e),
        });
      }
    }
    setBusy(false);
    setLocal(await listLocalProjects());
    toastManager.add({ type: "success", title: `Moved ${moved} project${moved === 1 ? "" : "s"} to your account` });
    if (moved === 1 && lastId) onImported(lastId);
  };

  return (
    <div className="mt-6 flex flex-wrap items-center gap-3 rounded-xl border bg-card px-4 py-3">
      <HardDriveUpload className="size-4 shrink-0 text-brand" />
      <p className="min-w-0 flex-1 text-sm">
        {local.length} project{local.length === 1 ? " is" : "s are"} saved only in this browser. Move{" "}
        {local.length === 1 ? "it" : "them"} to your account to open {local.length === 1 ? "it" : "them"} anywhere.
      </p>
      <Button size="sm" variant="brand" loading={busy} onClick={importAll}>
        Move to account
      </Button>
      <Button size="icon-sm" variant="ghost" aria-label="Dismiss" onClick={() => setHidden(true)}>
        <X />
      </Button>
    </div>
  );
}
