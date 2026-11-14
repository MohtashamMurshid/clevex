import type { ArxivPaper } from "@/app/api/arxiv/route";

export type { ArxivPaper };

export async function searchArxiv(q: string, signal?: AbortSignal): Promise<ArxivPaper[]> {
  const res = await fetch(`/api/arxiv?q=${encodeURIComponent(q)}`, { signal });
  const j = await res.json();
  if (!res.ok) throw new Error(j.error || "arXiv search failed");
  return j.papers;
}

function stripAccents(s: string) {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

export function citeKey(p: ArxivPaper) {
  const last = stripAccents(p.authors[0]?.split(" ").slice(-1)[0] ?? "anon")
    .toLowerCase()
    .replace(/[^a-z]/g, "");
  const year = p.published.slice(0, 4);
  const word =
    p.title
      .toLowerCase()
      .split(/\s+/)
      .map((w) => w.replace(/[^a-z]/g, ""))
      .find((w) => w.length > 3 && !["with", "from", "that", "this", "towards", "using"].includes(w)) ?? "paper";
  return `${last}${year}${word}`;
}

function escapeBib(s: string) {
  return s.replace(/([&%#_])/g, "\\$1");
}

export function toBibtex(p: ArxivPaper) {
  const id = p.id.replace(/v\d+$/, "");
  const fields: [string, string][] = [
    ["title", `{${escapeBib(p.title)}}`],
    ["author", p.authors.map(escapeBib).join(" and ")],
    ["year", p.published.slice(0, 4)],
    ["eprint", id],
    ["archivePrefix", "arXiv"],
  ];
  if (p.primaryCategory) fields.push(["primaryClass", p.primaryCategory]);
  if (p.doi) fields.push(["doi", p.doi]);
  if (p.journalRef) fields.push(["journal", escapeBib(p.journalRef)]);
  fields.push(["url", `https://arxiv.org/abs/${id}`]);
  const width = Math.max(...fields.map(([k]) => k.length));
  return `@misc{${citeKey(p)},\n${fields.map(([k, v]) => `  ${k.padEnd(width)} = {${v}}`).join(",\n")}\n}\n`;
}
