"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { Download, Minus, Plus, ScanLine } from "lucide-react";
import { CleveMark } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Tooltip, TooltipPopup, TooltipTrigger } from "@/components/ui/tooltip";
import { base64ToBytes } from "@/lib/zip";

type PdfJs = typeof import("pdfjs-dist");
let pdfjsPromise: Promise<PdfJs> | null = null;
function loadPdfJs() {
  pdfjsPromise ??= import("pdfjs-dist").then((m) => {
    m.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
    return m;
  });
  return pdfjsPromise;
}

type PageInfo = { width: number; height: number };

export function PdfViewer({
  pdf,
  compiling,
  onDownload,
  emptyHint,
}: {
  pdf?: string;
  compiling: boolean;
  onDownload: () => void;
  emptyHint?: React.ReactNode;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [pages, setPages] = useState<PageInfo[]>([]);
  const [zoom, setZoom] = useState<number | "fit">("fit");
  const [width, setWidth] = useState(600);
  const [current, setCurrent] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const scrollRatio = useRef(0);

  // Track container width for fit-to-width.
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  // Load document when the PDF changes; keep scroll position.
  useEffect(() => {
    if (!pdf) return;
    let cancelled = false;
    const el = scroller.current;
    if (el && el.scrollHeight > el.clientHeight) scrollRatio.current = el.scrollTop / el.scrollHeight;
    (async () => {
      try {
        const pdfjs = await loadPdfJs();
        const loaded = await pdfjs.getDocument({ data: base64ToBytes(pdf) }).promise;
        if (cancelled) return void loaded.loadingTask.destroy();
        const infos: PageInfo[] = [];
        for (let i = 1; i <= loaded.numPages; i++) {
          const p = await loaded.getPage(i);
          const v = p.getViewport({ scale: 1 });
          infos.push({ width: v.width, height: v.height });
        }
        if (cancelled) return void loaded.loadingTask.destroy();
        setDoc((old) => {
          old?.loadingTask.destroy();
          return loaded;
        });
        setPages(infos);
        setError(null);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pdf]);

  useEffect(() => () => void doc?.loadingTask.destroy(), [doc]);

  const baseWidth = pages[0]?.width ?? 612;
  const scale = zoom === "fit" ? Math.max(0.3, (width - 48) / baseWidth) : zoom;

  // Restore scroll after a re-render with new pages.
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el || !pages.length) return;
    el.scrollTop = scrollRatio.current * el.scrollHeight;
  }, [pages]);

  const onScroll = useCallback(() => {
    const el = scroller.current;
    if (!el || !pages.length) return;
    const mid = el.scrollTop + el.clientHeight / 3;
    let y = 24;
    for (let i = 0; i < pages.length; i++) {
      y += pages[i].height * scale + 20;
      if (y > mid) {
        setCurrent(i + 1);
        break;
      }
    }
  }, [pages, scale]);

  const zoomBy = (f: number) => setZoom((z) => Math.min(4, Math.max(0.3, (z === "fit" ? scale : z) * f)));

  return (
    <div className="flex h-full min-h-0 flex-col bg-paper">
      <div className="flex h-10 shrink-0 items-center justify-between gap-2 border-b bg-background/60 px-2.5 backdrop-blur">
        <div className="flex items-center gap-1.5 text-muted-foreground text-xs tabular-nums">
          {compiling && <Spinner className="size-3.5" />}
          {pages.length ? (
            <span>
              Page {current} / {pages.length}
            </span>
          ) : (
            <span>Preview</span>
          )}
        </div>
        <div className="flex items-center gap-0.5">
          <Tooltip>
            <TooltipTrigger render={<Button variant="ghost" size="icon-xs" aria-label="Zoom out" onClick={() => zoomBy(1 / 1.15)} />}>
              <Minus />
            </TooltipTrigger>
            <TooltipPopup>Zoom out</TooltipPopup>
          </Tooltip>
          <button
            type="button"
            onClick={() => setZoom("fit")}
            className="h-6 min-w-12 rounded-md px-1.5 text-muted-foreground text-xs tabular-nums hover:bg-accent"
          >
            {Math.round(scale * 100)}%
          </button>
          <Tooltip>
            <TooltipTrigger render={<Button variant="ghost" size="icon-xs" aria-label="Zoom in" onClick={() => zoomBy(1.15)} />}>
              <Plus />
            </TooltipTrigger>
            <TooltipPopup>Zoom in</TooltipPopup>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger render={<Button variant="ghost" size="icon-xs" aria-label="Fit width" onClick={() => setZoom("fit")} />}>
              <ScanLine />
            </TooltipTrigger>
            <TooltipPopup>Fit width</TooltipPopup>
          </Tooltip>
          <div className="mx-1 h-4 w-px bg-border" />
          <Tooltip>
            <TooltipTrigger render={<Button variant="ghost" size="icon-xs" aria-label="Download PDF" disabled={!pdf} onClick={onDownload} />}>
              <Download />
            </TooltipTrigger>
            <TooltipPopup>Download PDF</TooltipPopup>
          </Tooltip>
        </div>
      </div>
      <div ref={scroller} onScroll={onScroll} className="relative min-h-0 flex-1 overflow-auto">
        {!pdf ? (
          <div className="grid h-full place-items-center p-8 text-center">
            <div>
              {compiling ? (
                <Spinner className="mx-auto size-6 text-brand" />
              ) : (
                <CleveMark className="mx-auto h-10 w-auto opacity-80" blink />
              )}
              <div className="mt-3 font-medium text-sm">{compiling ? "Compiling…" : "No PDF yet"}</div>
              <div className="mt-1 text-muted-foreground text-xs">{emptyHint}</div>
            </div>
          </div>
        ) : error ? (
          <div className="p-6 text-destructive-foreground text-sm">Couldn&apos;t render PDF: {error}</div>
        ) : (
          <div className="flex flex-col items-center gap-5 px-6 py-6" style={{ minWidth: baseWidth * scale + 48 }}>
            {doc &&
              pages.map((p, i) => (
                <PdfPage key={`${i}`} doc={doc} index={i + 1} info={p} scale={scale} root={scroller} />
              ))}
          </div>
        )}
        {compiling && pdf && (
          <div className="pointer-events-none absolute inset-x-0 top-0 h-0.5 overflow-hidden">
            <div className="h-full w-1/3 animate-[progress_1.1s_ease-in-out_infinite] bg-brand" />
          </div>
        )}
      </div>
    </div>
  );
}

function PdfPage({
  doc,
  index,
  info,
  scale,
  root,
}: {
  doc: PDFDocumentProxy;
  index: number;
  info: PageInfo;
  scale: number;
  root: React.RefObject<HTMLDivElement | null>;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [visible, setVisible] = useState(index <= 2);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => e.isIntersecting && setVisible(true), {
      root: root.current,
      rootMargin: "800px 0px",
    });
    io.observe(el);
    return () => io.disconnect();
  }, [root]);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    let task: { cancel: () => void; promise: Promise<void> } | null = null;
    (async () => {
      const page = await doc.getPage(index);
      if (cancelled || !canvas.current) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
      const viewport = page.getViewport({ scale: scale * dpr });
      const off = document.createElement("canvas");
      off.width = Math.floor(viewport.width);
      off.height = Math.floor(viewport.height);
      const ctx = off.getContext("2d")!;
      task = page.render({ canvas: off, canvasContext: ctx, viewport });
      try {
        await task.promise;
      } catch {
        return;
      }
      if (cancelled || !canvas.current) return;
      const target = canvas.current;
      target.width = off.width;
      target.height = off.height;
      target.getContext("2d")!.drawImage(off, 0, 0);
    })();
    return () => {
      cancelled = true;
      task?.cancel();
    };
  }, [doc, index, scale, visible]);

  return (
    <div ref={wrap} className="pdf-page relative shrink-0" style={{ width: info.width * scale, height: info.height * scale }}>
      <canvas ref={canvas} className="block size-full" />
    </div>
  );
}
