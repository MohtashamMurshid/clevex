import type { CompileError } from "../types";

/** Extract errors and warnings from a TeX / Tectonic log. */
export function parseLatexLog(log: string): CompileError[] {
  const out: CompileError[] = [];
  const seen = new Set<string>();
  const push = (e: CompileError) => {
    const key = `${e.level}|${e.line ?? ""}|${e.message.replace(/[.\s]+$/, "").toLowerCase()}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push(e);
  };
  const lines = log.split(/\r?\n/);

  // Track the file stack loosely via "(./file.tex" markers.
  let currentFile: string | undefined;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const opened = line.match(/\((?:\.\/)?([\w\-./]+\.(?:tex|sty|cls|bib|bbl))/g);
    if (opened) {
      const last = opened[opened.length - 1].replace(/^\((?:\.\/)?/, "");
      if (last.endsWith(".tex")) currentFile = last;
    }

    // Tectonic style: "error: main.tex:12: Undefined control sequence"
    let m = line.match(/^(error|warning):\s+(?:([\w\-./]+\.tex):(\d+):\s*)?(.*)$/);
    if (m) {
      const message = m[4].trim();
      if (!message || /^halted on potentially-recoverable error/.test(message)) continue;
      if (/See the LaTeX manual|^the \w+ engine had an? (unrecoverable )?error|something bad happened inside|^failed to execute/i.test(message)) continue;
      push({
        level: m[1] === "error" ? "error" : "warning",
        file: m[2],
        line: m[3] ? Number(m[3]) : undefined,
        message,
      });
      continue;
    }

    // file-line-error style: "./main.tex:12: Undefined control sequence."
    m = line.match(/^(?:\.\/)?([\w\-./]+\.tex):(\d+):\s+(.*)$/);
    if (m) {
      push({ level: "error", file: m[1], line: Number(m[2]), message: m[3].trim() });
      continue;
    }

    // Classic TeX: "! Undefined control sequence." then later "l.12 \foo"
    if (line.startsWith("! ")) {
      const message = line.slice(2).trim();
      let lineNo: number | undefined;
      let context: string | undefined;
      for (let j = i + 1; j < Math.min(lines.length, i + 12); j++) {
        const lm = lines[j].match(/^l\.(\d+)\s?(.*)$/);
        if (lm) {
          lineNo = Number(lm[1]);
          context = lm[2];
          break;
        }
      }
      push({ level: "error", file: currentFile, line: lineNo, message, context });
      continue;
    }

    m = line.match(/^(?:LaTeX|Package (\w+)) Warning:\s*(.*)$/);
    if (m) {
      let message = m[2];
      // Warnings wrap across lines until a blank line.
      for (let j = i + 1; j < Math.min(lines.length, i + 4) && lines[j].trim(); j++) {
        message += " " + lines[j].trim().replace(/^\(\w+\)\s*/, "");
      }
      const lm = message.match(/on input line (\d+)/);
      push({
        level: "warning",
        file: currentFile,
        line: lm ? Number(lm[1]) : undefined,
        message: (m[1] ? `${m[1]}: ` : "") + message.replace(/\s+/g, " ").trim(),
      });
    }
  }
  return out.slice(0, 200);
}
