export type OutlineItem = { level: number; title: string; line: number; file: string };

const LEVELS: Record<string, number> = {
  part: 0,
  chapter: 1,
  section: 2,
  subsection: 3,
  subsubsection: 4,
  frametitle: 3,
};

export function parseOutline(content: string, file: string): OutlineItem[] {
  const items: OutlineItem[] = [];
  const lines = content.split("\n");
  lines.forEach((raw, i) => {
    const line = raw.replace(/(^|[^\\])%.*$/, "$1");
    const m = line.match(/\\(part|chapter|section|subsection|subsubsection|frametitle)\*?\s*(?:\[[^\]]*\])?\s*\{(.*)\}?/);
    if (m) {
      let title = m[2];
      // trim to matching brace
      let depth = 1;
      let out = "";
      for (const ch of title) {
        if (ch === "{") depth++;
        if (ch === "}") depth--;
        if (depth === 0) break;
        out += ch;
      }
      title = out.replace(/\\[a-zA-Z]+\*?/g, "").replace(/[{}$]/g, "").trim() || "(untitled)";
      items.push({ level: LEVELS[m[1]], title, line: i + 1, file });
    }
    if (/\\begin\{abstract\}/.test(line)) items.push({ level: 2, title: "Abstract", line: i + 1, file });
  });
  return items;
}

export function collectLabels(content: string): string[] {
  return [...content.matchAll(/\\label\{([^}]+)\}/g)].map((m) => m[1]);
}

export function collectBibKeys(content: string): string[] {
  return [...content.matchAll(/@\w+\s*\{\s*([^,\s]+)\s*,/g)].map((m) => m[1]);
}

export function wordCount(content: string) {
  const body = content.split(/\\begin\{document\}/)[1] ?? content;
  const text = body
    .replace(/(^|[^\\])%.*$/gm, "$1")
    .replace(/\$\$[\s\S]*?\$\$|\$[^$]*\$/g, " ")
    .replace(/\\begin\{(equation|align|figure|table|tikzpicture)\*?\}[\s\S]*?\\end\{\1\*?\}/g, " ")
    .replace(/\\[a-zA-Z]+\*?(\[[^\]]*\])?/g, " ")
    .replace(/[{}\\]/g, " ");
  return text.split(/\s+/).filter((w) => /[A-Za-z0-9]/.test(w)).length;
}
