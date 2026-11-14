import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { parseLatexLog } from "@/lib/latex/log";
import { serverEnv } from "@/lib/server/env";
import type { CompileResult } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 120;

type InFile = { path: string; content?: string; data?: string };
type Body = { files: InFile[]; main: string; engine?: "pdflatex" | "xelatex" | "lualatex" };

const SAFE_PATH = /^(?!\/)(?!.*\.\.)[\w\-./ ]+$/;

let tectonicPath: string | null | undefined;

async function findTectonic(): Promise<string | null> {
  if (tectonicPath !== undefined) return tectonicPath;
  const candidates = [
    process.env.TECTONIC_BIN,
    "tectonic",
    "/opt/homebrew/bin/tectonic",
    "/usr/local/bin/tectonic",
    path.join(process.env.HOME || "", ".cargo/bin/tectonic"),
  ].filter(Boolean) as string[];
  for (const c of candidates) {
    const ok = await new Promise<boolean>((resolve) => {
      execFile(c, ["--version"], { timeout: 5000 }, (err) => resolve(!err));
    });
    if (ok) return (tectonicPath = c);
  }
  return (tectonicPath = null);
}

async function compileWithTectonic(bin: string, body: Body): Promise<CompileResult> {
  const started = Date.now();
  const dir = await mkdtemp(path.join(tmpdir(), "clevex-"));
  try {
    for (const f of body.files) {
      const target = path.join(dir, f.path);
      await mkdir(path.dirname(target), { recursive: true });
      if (f.data !== undefined) await writeFile(target, Buffer.from(f.data, "base64"));
      else await writeFile(target, f.content ?? "");
    }
    const outDir = path.join(dir, "__out");
    await mkdir(outDir);
    const { stdout, stderr, code } = await new Promise<{ stdout: string; stderr: string; code: number }>((resolve) => {
      execFile(
        bin,
        ["--keep-logs", "--outdir", outDir, "--chatter", "minimal", body.main],
        { cwd: dir, timeout: 100_000, maxBuffer: 16 * 1024 * 1024 },
        (err, stdout, stderr) => {
          const c = err ? ((err as NodeJS.ErrnoException & { code?: number }).code as unknown as number) || 1 : 0;
          resolve({ stdout: String(stdout), stderr: String(stderr), code: typeof c === "number" ? c : 1 });
        },
      );
    });
    const base = body.main.replace(/\.tex$/, "");
    let texLog = "";
    try {
      texLog = await readFile(path.join(outDir, `${path.basename(base)}.log`), "utf8");
    } catch {
      /* no log */
    }
    let pdf: string | undefined;
    try {
      pdf = (await readFile(path.join(outDir, `${path.basename(base)}.pdf`))).toString("base64");
    } catch {
      /* no pdf */
    }
    const log = [stderr, stdout, texLog].filter(Boolean).join("\n");
    const errors = parseLatexLog(log);
    return {
      ok: code === 0 && !!pdf,
      pdf,
      log,
      errors: code === 0 ? errors.filter((e) => e.level === "warning") : errors,
      engine: "tectonic",
      durationMs: Date.now() - started,
    };
  } finally {
    rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

async function compileRemote(body: Body): Promise<CompileResult> {
  const started = Date.now();
  const resources = body.files.map((f) =>
    f.path === body.main
      ? { main: true, path: f.path, content: f.content ?? "" }
      : f.data !== undefined
        ? { path: f.path, file: f.data }
        : { path: f.path, content: f.content ?? "" },
  );
  const res = await fetch(serverEnv.latexRemote, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ compiler: body.engine ?? "pdflatex", resources }),
    signal: AbortSignal.timeout(110_000),
  });
  const type = res.headers.get("content-type") || "";
  if (res.ok && type.includes("pdf")) {
    const pdf = Buffer.from(await res.arrayBuffer()).toString("base64");
    return { ok: true, pdf, log: "", errors: [], engine: `remote:${body.engine ?? "pdflatex"}`, durationMs: Date.now() - started };
  }
  const text = await res.text();
  let log = text;
  try {
    const j = JSON.parse(text);
    log = j.logs || j.error || text;
  } catch {
    /* raw */
  }
  const errors = parseLatexLog(log);
  return {
    ok: false,
    log,
    errors: errors.length ? errors : [{ level: "error", message: `Compile service returned ${res.status}` }],
    engine: `remote:${body.engine ?? "pdflatex"}`,
    durationMs: Date.now() - started,
  };
}

export async function POST(req: Request) {
  const body = (await req.json()) as Body;
  if (!body?.files?.length || !body.main) return Response.json({ error: "Nothing to compile" }, { status: 400 });
  for (const f of body.files) {
    if (!SAFE_PATH.test(f.path)) return Response.json({ error: `Bad file path: ${f.path}` }, { status: 400 });
  }
  if (!body.files.some((f) => f.path === body.main)) {
    return Response.json({ error: `Main file ${body.main} not found` }, { status: 400 });
  }

  try {
    if (serverEnv.compiler !== "remote") {
      const bin = await findTectonic();
      if (bin) return Response.json(await compileWithTectonic(bin, body));
      if (serverEnv.compiler === "tectonic") {
        return Response.json({ error: "Tectonic is not installed on this server." }, { status: 500 });
      }
    }
    return Response.json(await compileRemote(body));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const result: CompileResult = {
      ok: false,
      log: message,
      errors: [{ level: "error", message: `Compiler failed: ${message}` }],
      engine: "none",
      durationMs: 0,
    };
    return Response.json(result);
  }
}

export async function GET() {
  const bin = serverEnv.compiler === "remote" ? null : await findTectonic();
  return Response.json({ engine: bin ? "tectonic" : "remote" });
}
