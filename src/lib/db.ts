"use client";

/**
 * Project data, stored in Convex and scoped to the signed-in user.
 * Text files are stored inline; binary files (figures) and chat images go to
 * Convex file storage and are fetched back as base64 for compiling.
 */

import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { convex } from "./convex";
import type { ChatImage, ChatThread, Project, ProjectFile } from "./types";
import { base64ToBytes, bytesToBase64 } from "./zip";

export { loadPdf, savePdf } from "./local-db";

export function uid(prefix = "") {
  const rand = crypto.getRandomValues(new Uint8Array(9));
  return (
    prefix +
    Array.from(rand)
      .map((b) => b.toString(36).padStart(2, "0"))
      .join("")
      .slice(0, 14)
  );
}

const pid = (id: string) => id as Id<"projects">;

// ---------- Storage helpers ----------

async function upload(base64: string, mime: string): Promise<Id<"_storage">> {
  const url = await convex.mutation(api.files.generateUploadUrl, {});
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": mime || "application/octet-stream" },
    body: base64ToBytes(base64) as BlobPart,
  });
  if (!res.ok) throw new Error(`Upload failed (${res.status})`);
  const { storageId } = (await res.json()) as { storageId: Id<"_storage"> };
  return storageId;
}

const blobCache = new Map<string, Promise<string>>();

/** Download a stored blob as base64 (cached per storage id — blobs are immutable). */
function fetchBase64(storageId: string, url: string): Promise<string> {
  let p = blobCache.get(storageId);
  if (!p) {
    p = fetch(url)
      .then((r) => {
        if (!r.ok) throw new Error(`Download failed (${r.status})`);
        return r.arrayBuffer();
      })
      .then((buf) => bytesToBase64(new Uint8Array(buf)));
    blobCache.set(storageId, p);
    p.catch(() => blobCache.delete(storageId));
  }
  return p;
}

// ---------- Projects ----------

export async function listProjects(): Promise<Project[]> {
  return convex.query(api.projects.list, {});
}

export async function getProject(id: string): Promise<Project | null> {
  return convex.query(api.projects.get, { id });
}

export async function saveProject(p: Project) {
  await convex.mutation(api.projects.update, {
    id: pid(p.id),
    name: p.name,
    mainFile: p.mainFile,
    compiler: p.compiler,
  });
}

export async function touchProject(id: string) {
  await convex.mutation(api.projects.touch, { id: pid(id) });
}

export async function deleteProject(id: string) {
  await convex.mutation(api.projects.remove, { id: pid(id) });
}

export async function duplicateProject(id: string) {
  return convex.mutation(api.projects.duplicate, { id: pid(id) });
}

type NewFile = { path: string; content?: string; data?: string; mime?: string };

export async function createProject(opts: {
  name: string;
  template: string;
  files: NewFile[];
  mainFile?: string;
  compiler?: Project["compiler"];
}): Promise<Project> {
  const files = await Promise.all(
    opts.files.map(async (f) =>
      f.content !== undefined
        ? { path: f.path, content: f.content }
        : { path: f.path, storageId: await upload(f.data ?? "", f.mime ?? ""), mime: f.mime },
    ),
  );
  const id = await convex.mutation(api.projects.create, {
    name: opts.name,
    template: opts.template,
    mainFile: opts.mainFile ?? "main.tex",
    compiler: opts.compiler,
    files,
  });
  const project = await getProject(id);
  if (!project) throw new Error("Project was not created");
  return project;
}

// ---------- Files ----------

export async function listFiles(projectId: string): Promise<ProjectFile[]> {
  const rows = await convex.query(api.files.list, { projectId: pid(projectId) });
  const files = await Promise.all(
    rows.map(async (f): Promise<ProjectFile> => {
      if (f.content !== undefined || !f.storageId || !f.url) {
        return { path: f.path, content: f.content ?? "", updatedAt: f.updatedAt };
      }
      return {
        path: f.path,
        mime: f.mime,
        storageId: f.storageId,
        data: await fetchBase64(f.storageId, f.url),
        updatedAt: f.updatedAt,
      };
    }),
  );
  return files.sort((a, b) => a.path.localeCompare(b.path));
}

export async function putFile(projectId: string, file: ProjectFile) {
  if (file.content !== undefined) {
    await convex.mutation(api.files.put, { projectId: pid(projectId), path: file.path, content: file.content });
    return file;
  }
  const storageId = (file.storageId as Id<"_storage"> | undefined) ?? (await upload(file.data ?? "", file.mime ?? ""));
  await convex.mutation(api.files.put, { projectId: pid(projectId), path: file.path, storageId, mime: file.mime });
  return { ...file, storageId };
}

export async function deleteFile(projectId: string, path: string) {
  await convex.mutation(api.files.remove, { projectId: pid(projectId), path });
}

export async function renameFile(projectId: string, from: string, to: string) {
  await convex.mutation(api.files.rename, { projectId: pid(projectId), from, to });
}

// ---------- Chat threads ----------

export async function listThreads(projectId: string): Promise<ChatThread[]> {
  const rows = await convex.query(api.threads.list, { projectId: pid(projectId) });
  return rows.map((t) => ({
    id: t.id,
    projectId: t.projectId,
    title: t.title,
    updatedAt: t.updatedAt,
    messages: t.messages.map((m) => ({
      ...m,
      images: m.images?.map((img): ChatImage => ({ mime: img.mime, name: img.name, storageId: img.storageId, url: img.url })),
    })),
  }));
}

/**
 * Persist a thread. New images are uploaded first; the returned thread carries
 * their storage ids so later saves don't upload them again.
 */
export async function saveThread(t: ChatThread): Promise<ChatThread> {
  const messages = await Promise.all(
    t.messages.map(async (m) => {
      if (!m.images?.length) return m;
      const images = await Promise.all(
        m.images.map(async (img) =>
          img.storageId || !img.data ? img : { ...img, storageId: await upload(img.data, img.mime) },
        ),
      );
      return { ...m, images };
    }),
  );
  const wire = messages.map((m) => ({
    id: m.id,
    role: m.role,
    text: m.text,
    createdAt: m.createdAt,
    ...(m.thinking ? { thinking: m.thinking } : {}),
    ...(m.model ? { model: m.model } : {}),
    ...(m.provider ? { provider: m.provider } : {}),
    ...(m.error ? { error: m.error } : {}),
    ...(m.applied ? { applied: m.applied } : {}),
    ...(m.images?.length
      ? {
          images: m.images
            .filter((i) => i.storageId)
            .map((i) => ({ mime: i.mime, storageId: i.storageId as Id<"_storage">, ...(i.name ? { name: i.name } : {}) })),
        }
      : {}),
  }));
  await convex.mutation(api.threads.save, { key: t.id, projectId: pid(t.projectId), title: t.title, messages: wire });
  return { ...t, messages };
}

export async function deleteThread(id: string) {
  await convex.mutation(api.threads.remove, { key: id });
}
