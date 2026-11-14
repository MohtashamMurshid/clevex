export const runtime = "nodejs";

export type ArxivPaper = {
  id: string;
  title: string;
  authors: string[];
  summary: string;
  published: string;
  url: string;
  primaryCategory?: string;
  doi?: string;
  journalRef?: string;
};

function decode(s: string) {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function tag(xml: string, name: string) {
  const m = xml.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`));
  return m ? decode(m[1]) : undefined;
}

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams.get("q")?.trim();
  if (!q) return Response.json({ papers: [] });
  const looksLikeId = /^(\d{4}\.\d{4,5})(v\d+)?$/.test(q);
  const url = new URL("https://export.arxiv.org/api/query");
  if (looksLikeId) url.searchParams.set("id_list", q);
  else url.searchParams.set("search_query", `all:${q}`);
  url.searchParams.set("start", "0");
  url.searchParams.set("max_results", "12");
  url.searchParams.set("sortBy", "relevance");

  const res = await fetch(url, {
    headers: { "user-agent": "clevex/0.1 (LaTeX editor)" },
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) return Response.json({ error: `arXiv returned ${res.status}` }, { status: 502 });
  const xml = await res.text();
  const papers: ArxivPaper[] = [];
  for (const m of xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)) {
    const e = m[1];
    const idUrl = tag(e, "id") || "";
    const id = idUrl.replace(/^https?:\/\/arxiv\.org\/abs\//, "");
    if (!id) continue;
    papers.push({
      id,
      title: tag(e, "title") || id,
      authors: [...e.matchAll(/<author>\s*<name>([\s\S]*?)<\/name>/g)].map((a) => decode(a[1])),
      summary: tag(e, "summary") || "",
      published: tag(e, "published") || "",
      url: idUrl.replace(/^http:/, "https:"),
      primaryCategory: e.match(/<arxiv:primary_category[^>]*term="([^"]+)"/)?.[1],
      doi: tag(e, "arxiv:doi"),
      journalRef: tag(e, "arxiv:journal_ref"),
    });
  }
  return Response.json({ papers });
}
