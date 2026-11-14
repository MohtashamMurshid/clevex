/**
 * Parse and apply the edit blocks the assistant emits:
 *
 *   <edit file="main.tex">
 *   <<<<<<< SEARCH
 *   old
 *   =======
 *   new
 *   >>>>>>> REPLACE
 *   </edit>
 *
 *   <file path="x.tex">full contents</file>
 */

export type EditHunk = { search: string; replace: string };

export type EditBlock =
  | { kind: "edit"; file: string; hunks: EditHunk[]; complete: boolean }
  | { kind: "file"; file: string; content: string; complete: boolean };

export type Segment = { type: "text"; text: string } | { type: "block"; block: EditBlock; index: number };

const OPEN = /<(edit)\s+file="([^"]+)"\s*>|<(file)\s+path="([^"]+)"\s*>/g;

function parseHunks(body: string): EditHunk[] {
  const hunks: EditHunk[] = [];
  const re = /<{5,9} ?SEARCH[^\n]*\n([\s\S]*?)\n?={5,9}[^\n]*\n([\s\S]*?)(?:\n?>{5,9} ?REPLACE|$)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body))) {
    hunks.push({ search: m[1], replace: m[2].replace(/\n?>{5,9} ?REPL?A?C?E?$/, "") });
  }
  return hunks;
}

/** Split assistant text into prose and edit blocks. Works on partial (streaming) text. */
export function splitSegments(text: string): Segment[] {
  const segments: Segment[] = [];
  let cursor = 0;
  let index = 0;
  OPEN.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = OPEN.exec(text))) {
    const isEdit = !!m[1];
    const file = (isEdit ? m[2] : m[4]).trim();
    const closeTag = isEdit ? "</edit>" : "</file>";
    const bodyStart = m.index + m[0].length;
    const closeAt = text.indexOf(closeTag, bodyStart);
    const complete = closeAt !== -1;
    const body = text.slice(bodyStart, complete ? closeAt : text.length);
    const before = text.slice(cursor, m.index);
    if (before.trim()) segments.push({ type: "text", text: before });
    const block: EditBlock = isEdit
      ? { kind: "edit", file, hunks: parseHunks(body.replace(/^\n/, "")), complete }
      : { kind: "file", file, content: body.replace(/^\n/, "").replace(/\n$/, ""), complete };
    segments.push({ type: "block", block, index: index++ });
    cursor = complete ? closeAt + closeTag.length : text.length;
    OPEN.lastIndex = cursor;
    if (!complete) break;
  }
  const rest = text.slice(cursor);
  // Hide a half-typed opening tag at the very end while streaming.
  const trimmed = rest.replace(/<(e(d(i(t)?)?)?|f(i(l(e)?)?)?)?[^>\n]*$/, (s) => (s.startsWith("<") ? "" : s));
  if (trimmed.trim()) segments.push({ type: "text", text: trimmed });
  return segments;
}

function normalizeWs(s: string) {
  return s
    .split("\n")
    .map((l) => l.replace(/\s+$/, ""))
    .join("\n");
}

/** Apply a hunk; tolerant of trailing whitespace and indentation differences. */
export function applyHunk(source: string, hunk: EditHunk): string | null {
  if (hunk.search === "") return null;
  const idx = source.indexOf(hunk.search);
  if (idx !== -1) return source.slice(0, idx) + hunk.replace + source.slice(idx + hunk.search.length);

  // Retry ignoring trailing whitespace, mapping back by line.
  const srcLines = source.split("\n");
  const needle = normalizeWs(hunk.search).split("\n");
  const norm = srcLines.map((l) => l.replace(/\s+$/, ""));
  for (let i = 0; i + needle.length <= norm.length; i++) {
    let ok = true;
    for (let j = 0; j < needle.length; j++) {
      if (norm[i + j] !== needle[j]) {
        ok = false;
        break;
      }
    }
    if (ok) {
      return [...srcLines.slice(0, i), ...hunk.replace.split("\n"), ...srcLines.slice(i + needle.length)].join("\n");
    }
  }

  // Last resort: ignore leading indentation too.
  const strip = (l: string) => l.trim();
  const needle2 = needle.map(strip);
  for (let i = 0; i + needle2.length <= srcLines.length; i++) {
    let ok = true;
    for (let j = 0; j < needle2.length; j++) {
      if (strip(srcLines[i + j]) !== needle2[j]) {
        ok = false;
        break;
      }
    }
    if (ok) {
      return [...srcLines.slice(0, i), ...hunk.replace.split("\n"), ...srcLines.slice(i + needle2.length)].join("\n");
    }
  }
  return null;
}

export type ApplyOutcome = { ok: true; content: string } | { ok: false; reason: string; content?: string };

export function applyBlock(current: string | undefined, block: EditBlock): ApplyOutcome {
  if (block.kind === "file") return { ok: true, content: block.content };
  if (current === undefined) return { ok: false, reason: `${block.file} does not exist` };
  let content = current;
  for (let i = 0; i < block.hunks.length; i++) {
    const next = applyHunk(content, block.hunks[i]);
    if (next === null) {
      return {
        ok: false,
        reason: `Couldn't find change ${i + 1} of ${block.hunks.length} in ${block.file} — the file may have changed.`,
      };
    }
    content = next;
  }
  return { ok: true, content };
}
