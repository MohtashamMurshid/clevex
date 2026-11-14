"use client";

import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { ChatThread, Project, ProjectFile } from "./types";

interface ClevexDB extends DBSchema {
  projects: { key: string; value: Project };
  files: {
    key: [string, string];
    value: ProjectFile & { projectId: string };
    indexes: { byProject: string };
  };
  threads: {
    key: string;
    value: ChatThread;
    indexes: { byProject: string };
  };
  pdfs: { key: string; value: { projectId: string; pdf: string; at: number } };
}

let dbPromise: Promise<IDBPDatabase<ClevexDB>> | null = null;

function db() {
  if (!dbPromise) {
    dbPromise = openDB<ClevexDB>("clevex", 1, {
      upgrade(d) {
        d.createObjectStore("projects", { keyPath: "id" });
        const files = d.createObjectStore("files", { keyPath: ["projectId", "path"] });
        files.createIndex("byProject", "projectId");
        const threads = d.createObjectStore("threads", { keyPath: "id" });
        threads.createIndex("byProject", "projectId");
        d.createObjectStore("pdfs", { keyPath: "projectId" });
      },
    });
  }
  return dbPromise;
}

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

export async function listProjects(): Promise<Project[]> {
  const all = await (await db()).getAll("projects");
  return all.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function getProject(id: string) {
  return (await db()).get("projects", id);
}

export async function saveProject(p: Project) {
  await (await db()).put("projects", p);
}

export async function touchProject(id: string) {
  const d = await db();
  const p = await d.get("projects", id);
  if (p) await d.put("projects", { ...p, updatedAt: Date.now() });
}

export async function deleteProject(id: string) {
  const d = await db();
  const tx = d.transaction(["projects", "files", "threads", "pdfs"], "readwrite");
  await tx.objectStore("projects").delete(id);
  for (const key of await tx.objectStore("files").index("byProject").getAllKeys(id)) {
    await tx.objectStore("files").delete(key);
  }
  for (const key of await tx.objectStore("threads").index("byProject").getAllKeys(id)) {
    await tx.objectStore("threads").delete(key);
  }
  await tx.objectStore("pdfs").delete(id);
  await tx.done;
}

export async function listFiles(projectId: string): Promise<ProjectFile[]> {
  const rows = await (await db()).getAllFromIndex("files", "byProject", projectId);
  return rows
    .map((row) => {
      const { projectId, ...f } = row;
      void projectId;
      return f;
    })
    .sort((a, b) => a.path.localeCompare(b.path));
}

export async function putFile(projectId: string, file: ProjectFile) {
  await (await db()).put("files", { ...file, projectId });
}

export async function deleteFile(projectId: string, path: string) {
  await (await db()).delete("files", [projectId, path]);
}

export async function renameFile(projectId: string, from: string, to: string) {
  const d = await db();
  const f = await d.get("files", [projectId, from]);
  if (!f) return;
  await d.delete("files", [projectId, from]);
  await d.put("files", { ...f, path: to, updatedAt: Date.now() });
}

export async function listThreads(projectId: string): Promise<ChatThread[]> {
  const rows = await (await db()).getAllFromIndex("threads", "byProject", projectId);
  return rows.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function saveThread(t: ChatThread) {
  await (await db()).put("threads", t);
}

export async function deleteThread(id: string) {
  await (await db()).delete("threads", id);
}

export async function savePdf(projectId: string, pdf: string) {
  await (await db()).put("pdfs", { projectId, pdf, at: Date.now() });
}

export async function loadPdf(projectId: string) {
  return (await (await db()).get("pdfs", projectId))?.pdf;
}

export async function createProject(opts: {
  name: string;
  template: string;
  files: { path: string; content?: string; data?: string; mime?: string }[];
  mainFile?: string;
}): Promise<Project> {
  const now = Date.now();
  const project: Project = {
    id: uid("p_"),
    name: opts.name,
    mainFile: opts.mainFile ?? "main.tex",
    createdAt: now,
    updatedAt: now,
    accent: Math.floor(Math.random() * 6),
    template: opts.template,
    compiler: "pdflatex",
  };
  await saveProject(project);
  for (const f of opts.files) {
    await putFile(project.id, { ...f, updatedAt: now });
  }
  return project;
}
