import type { CompileError, ProjectFile } from "../types";

export const CHAT_SYSTEM = `You are clevex, an expert research collaborator built into a LaTeX editor. You help scientists write, edit, typeset and reason about their papers.

How to answer:
- Be direct and concrete. Prefer short paragraphs and lists. Use Markdown; write math with $…$ or $$…$$.
- When the user asks you to change the document, make the change instead of describing it, using edit blocks (below). Explain briefly what you changed, before or after the blocks.
- Keep LaTeX compilable: balance environments and braces, use packages already loaded or add the \\usepackage line in the preamble with an edit.
- For citations, only cite works you are confident exist. Give a BibTeX entry with an edit to the .bib file, and say if details should be verified.
- Never invent experimental results or data.

Edit blocks. To modify an existing file, emit one block per file:

<edit file="main.tex">
<<<<<<< SEARCH
exact text copied from the current file
=======
replacement text
>>>>>>> REPLACE
</edit>

Rules for edit blocks:
- SEARCH must match the current file exactly (including whitespace) and be unique. Keep it short: a few lines around the change.
- You may put several SEARCH/REPLACE pairs inside one <edit> block, in file order.
- To delete text, leave the replacement empty.
- To create a new file or fully replace a small one, use: <file path="sections/intro.tex">full contents</file>
- Do not wrap edit blocks in code fences.`;

export const INLINE_SYSTEM = `You are clevex's inline LaTeX editor. You rewrite a selected passage of a LaTeX document according to an instruction.

Return ONLY the replacement LaTeX for the selection — no explanations, no Markdown fences, no edit blocks. Preserve the author's macros, labels, citations and math unless told otherwise. The result must drop in place of the selection and still compile.`;

export const IMAGE_SYSTEM = `You convert images of handwritten or printed math, tables and diagrams into clean LaTeX.

Return ONLY LaTeX that can be pasted into a document body: equations in align/equation environments, tables with booktabs, diagrams as TikZ when reasonable. No preamble, no Markdown fences, no commentary.`;

export function buildProjectContext(files: ProjectFile[], mainFile: string, budgetChars = 350_000) {
  const textFiles = files.filter((f) => f.content !== undefined);
  const binary = files.filter((f) => f.content === undefined).map((f) => f.path);
  const ordered = [
    ...textFiles.filter((f) => f.path === mainFile),
    ...textFiles.filter((f) => f.path !== mainFile && f.path.endsWith(".tex")),
    ...textFiles.filter((f) => !f.path.endsWith(".tex")),
  ];
  let used = 0;
  const parts: string[] = [];
  const omitted: string[] = [];
  for (const f of ordered) {
    const body = f.content ?? "";
    if (used + body.length > budgetChars) {
      omitted.push(f.path);
      continue;
    }
    used += body.length;
    parts.push(`<document path="${f.path}">\n${body}\n</document>`);
  }
  return [
    `<project main="${mainFile}">`,
    ...parts,
    binary.length ? `<binary_files>${binary.join(", ")}</binary_files>` : "",
    omitted.length ? `<omitted reason="too large">${omitted.join(", ")}</omitted>` : "",
    `</project>`,
  ]
    .filter(Boolean)
    .join("\n");
}

export function buildTurnContext(opts: {
  activeFile?: string;
  cursorLine?: number;
  selection?: string;
  errors?: CompileError[];
}) {
  const bits: string[] = [];
  if (opts.activeFile) bits.push(`Open file: ${opts.activeFile}${opts.cursorLine ? ` (cursor at line ${opts.cursorLine})` : ""}`);
  if (opts.selection?.trim()) bits.push(`Selected text:\n<selection>\n${opts.selection}\n</selection>`);
  const errs = (opts.errors ?? []).filter((e) => e.level === "error").slice(0, 8);
  if (errs.length) {
    bits.push(
      `Latest compile errors:\n${errs.map((e) => `- ${e.file ?? "?"}:${e.line ?? "?"} ${e.message}`).join("\n")}`,
    );
  }
  return bits.length ? `<editor_state>\n${bits.join("\n\n")}\n</editor_state>\n\n` : "";
}

export function fixErrorsPrompt(errors: CompileError[], log: string) {
  const list = errors
    .filter((e) => e.level === "error")
    .slice(0, 10)
    .map((e) => `- ${e.file ?? "?"}:${e.line ?? "?"} — ${e.message}${e.context ? ` (near: ${e.context})` : ""}`)
    .join("\n");
  const tail = log.split("\n").slice(-60).join("\n");
  return `The document fails to compile. Find the root cause and fix it with edit blocks.\n\nErrors:\n${list || "(none parsed)"}\n\nEnd of log:\n\`\`\`\n${tail}\n\`\`\``;
}
