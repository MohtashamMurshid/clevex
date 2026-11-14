"use client";

/**
 * Browser-only storage (IndexedDB). Before accounts existed, clevex kept whole
 * projects here. Now it only caches compiled PDFs and is the source for
 * "move local projects to your account". Project data lives in Convex (./db.ts).
 */

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

export async function listLocalProjects(): Promise<Project[]> {
  try {
    const all = await (await db()).getAll("projects");
    return all.sort((a, b) => b.updatedAt - a.updatedAt);
  } catch {
    return [];
  }
}

export async function listLocalFiles(projectId: string): Promise<ProjectFile[]> {
  const rows = await (await db()).getAllFromIndex("files", "byProject", projectId);
  return rows
    .map((row) => {
      const { projectId: owner, ...f } = row;
      void owner;
      return f;
    })
    .sort((a, b) => a.path.localeCompare(b.path));
}

export async function listLocalThreads(projectId: string): Promise<ChatThread[]> {
  const rows = await (await db()).getAllFromIndex("threads", "byProject", projectId);
  return rows.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function deleteLocalProject(id: string) {
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

/** Cache of the last compiled PDF per project, so reopening shows it instantly. */
export async function savePdf(projectId: string, pdf: string) {
  try {
    await (await db()).put("pdfs", { projectId, pdf, at: Date.now() });
  } catch {
    /* cache only */
  }
}

export async function loadPdf(projectId: string) {
  try {
    return (await (await db()).get("pdfs", projectId))?.pdf;
  } catch {
    return undefined;
  }
}

export async function deletePdf(projectId: string) {
  try {
    await (await db()).delete("pdfs", projectId);
  } catch {
    /* cache only */
  }
}
