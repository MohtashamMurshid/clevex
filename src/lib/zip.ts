"use client";

import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import type { ProjectFile } from "./types";

const TEXT_EXT = /\.(tex|bib|cls|sty|bst|txt|md|csv|dat|tikz|bbx|cbx|lbx|def|cfg|ist|json)$/i;
const MIME: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  svg: "image/svg+xml",
  pdf: "application/pdf",
  eps: "application/postscript",
};

export function isTextPath(path: string) {
  return TEXT_EXT.test(path);
}

export function mimeFor(path: string) {
  return MIME[path.split(".").pop()?.toLowerCase() ?? ""] ?? "application/octet-stream";
}

export function bytesToBase64(bytes: Uint8Array) {
  let s = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    s += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(s);
}

export function base64ToBytes(b64: string) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export type ImportedFile = { path: string; content?: string; data?: string; mime?: string };

/** Read user-picked files (.tex/.bib/images or a .zip) into project files. */
export async function readUploads(files: FileList | File[]): Promise<ImportedFile[]> {
  const out: ImportedFile[] = [];
  for (const file of Array.from(files)) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (/\.zip$/i.test(file.name)) {
      const entries = unzipSync(bytes);
      const paths = Object.keys(entries).filter((p) => !p.endsWith("/") && !p.startsWith("__MACOSX") && !/\/\./.test(`/${p}`));
      // Strip a single shared top-level folder.
      const tops = new Set(paths.map((p) => p.split("/")[0]));
      const strip = tops.size === 1 && paths.every((p) => p.includes("/")) ? `${[...tops][0]}/` : "";
      for (const p of paths) {
        const path = p.slice(strip.length);
        if (!path) continue;
        out.push(toImported(path, entries[p]));
      }
    } else {
      out.push(toImported(file.webkitRelativePath || file.name, bytes));
    }
  }
  return out;
}

function toImported(path: string, bytes: Uint8Array): ImportedFile {
  if (isTextPath(path)) return { path, content: strFromU8(bytes) };
  return { path, data: bytesToBase64(bytes), mime: mimeFor(path) };
}

export function guessMainFile(files: ImportedFile[]) {
  const tex = files.filter((f) => f.path.endsWith(".tex") && f.content !== undefined);
  return (
    tex.find((f) => /\\documentclass/.test(f.content!) && /^main\.tex$/i.test(f.path))?.path ??
    tex.find((f) => /\\documentclass/.test(f.content!))?.path ??
    tex[0]?.path ??
    "main.tex"
  );
}

export function zipProject(files: ProjectFile[], pdf?: string, pdfName = "output.pdf") {
  const entries: Record<string, Uint8Array> = {};
  for (const f of files) {
    entries[f.path] = f.content !== undefined ? strToU8(f.content) : base64ToBytes(f.data ?? "");
  }
  if (pdf) entries[pdfName] = base64ToBytes(pdf);
  return zipSync(entries, { level: 6 });
}

export function downloadBytes(bytes: Uint8Array | string, name: string, type: string) {
  const blob =
    typeof bytes === "string" ? new Blob([bytes], { type }) : new Blob([bytes as BlobPart], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
