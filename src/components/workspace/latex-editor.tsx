"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import {
  autocompletion,
  closeBrackets,
  closeBracketsKeymap,
  completionKeymap,
  type CompletionContext,
  type CompletionResult,
} from "@codemirror/autocomplete";
import { defaultKeymap, history, historyKeymap, indentWithTab, toggleComment } from "@codemirror/commands";
import {
  bracketMatching,
  foldGutter,
  HighlightStyle,
  indentOnInput,
  StreamLanguage,
  syntaxHighlighting,
} from "@codemirror/language";
import { stex } from "@codemirror/legacy-modes/mode/stex";
import { linter, type Diagnostic, forceLinting } from "@codemirror/lint";
import { highlightSelectionMatches, search, searchKeymap } from "@codemirror/search";
import { Compartment, EditorSelection, EditorState, type Extension } from "@codemirror/state";
import {
  drawSelection,
  EditorView,
  highlightActiveLine,
  highlightActiveLineGutter,
  keymap,
  lineNumbers,
  placeholder,
  rectangularSelection,
} from "@codemirror/view";
import { tags as t } from "@lezer/highlight";
import type { CompileError } from "@/lib/types";

const latexLang = StreamLanguage.define({
  ...stex,
  languageData: { commentTokens: { line: "%" } },
});

const highlight = HighlightStyle.define([
  { tag: t.tagName, color: "var(--cm-cmd)" },
  { tag: t.keyword, color: "var(--cm-math)" },
  { tag: t.atom, color: "var(--cm-env)", fontWeight: "500" },
  { tag: t.comment, color: "var(--cm-comment)", fontStyle: "italic" },
  { tag: t.bracket, color: "var(--cm-bracket)" },
  { tag: t.number, color: "var(--cm-number)" },
  { tag: t.special(t.variableName), color: "var(--cm-math)" },
  { tag: t.invalid, color: "var(--destructive-foreground)" },
]);

const theme = EditorView.theme({
  "&": {
    color: "var(--foreground)",
    backgroundColor: "transparent",
    fontSize: "var(--cm-font-size, 13.5px)",
  },
  ".cm-content": { padding: "14px 0 40vh", caretColor: "var(--brand)" },
  ".cm-line": { padding: "0 18px 0 10px" },
  ".cm-gutters": {
    backgroundColor: "transparent",
    color: "color-mix(in srgb, var(--muted-foreground) 70%, transparent)",
    border: "none",
    paddingLeft: "6px",
  },
  ".cm-lineNumbers .cm-gutterElement": { minWidth: "2.4em", fontSize: "11px", paddingTop: "1px" },
  ".cm-foldGutter .cm-gutterElement": { width: "12px", fontSize: "11px", color: "var(--muted-foreground)", opacity: 0.6 },
  ".cm-activeLine": { backgroundColor: "color-mix(in srgb, var(--foreground) 3.5%, transparent)" },
  ".cm-activeLineGutter": { backgroundColor: "transparent", color: "var(--foreground)" },
  "&.cm-focused .cm-cursor": { borderLeftColor: "var(--brand)", borderLeftWidth: "2px" },
  "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection": {
    backgroundColor: "color-mix(in srgb, var(--brand) 22%, transparent) !important",
  },
  ".cm-matchingBracket": {
    backgroundColor: "color-mix(in srgb, var(--brand) 18%, transparent)",
    outline: "none",
  },
  ".cm-selectionMatch": { backgroundColor: "color-mix(in srgb, var(--sun) 28%, transparent)" },
  ".cm-searchMatch": { backgroundColor: "color-mix(in srgb, var(--sun) 40%, transparent)" },

  ".cm-tooltip": {
    backgroundColor: "var(--popover)",
    color: "var(--popover-foreground)",
    border: "1px solid var(--border)",
    borderRadius: "10px",
    boxShadow: "0 2px 6px rgb(0 0 0 / 0.08), 0 24px 48px -12px rgb(0 0 0 / 0.22)",
    overflow: "hidden",
  },
  ".cm-tooltip-autocomplete > ul > li": { padding: "3px 10px !important", fontFamily: "var(--font-geist-mono), ui-monospace, monospace" },
  ".cm-tooltip-autocomplete > ul > li[aria-selected]": {
    backgroundColor: "var(--brand-subtle)",
    color: "var(--foreground)",
  },
  ".cm-completionDetail": { color: "var(--muted-foreground)", fontStyle: "normal", marginLeft: "8px" },
  ".cm-panels": { backgroundColor: "var(--card)", color: "var(--foreground)", borderColor: "var(--border)" },
  ".cm-panels input, .cm-panels button": { fontFamily: "var(--font-inter), ui-sans-serif, system-ui", fontSize: "12px" },
  ".cm-textfield": {
    border: "1px solid var(--input)",
    borderRadius: "6px",
    background: "var(--background)",
    padding: "2px 6px",
  },
  ".cm-button": {
    backgroundImage: "none",
    background: "var(--secondary)",
    border: "1px solid var(--border)",
    borderRadius: "6px",
  },
  ".cm-diagnostic-error": { borderLeftColor: "var(--destructive)" },
  ".cm-diagnostic-warning": { borderLeftColor: "var(--warning)" },
  ".cm-lintRange-error": {
    backgroundImage: "none",
    textDecoration: "underline wavy var(--destructive)",
    textUnderlineOffset: "3px",
  },
  ".cm-lintRange-warning": { backgroundImage: "none" },
  ".cm-placeholder": { color: "var(--muted-foreground)" },
});

const COMMANDS = [
  "section{}", "subsection{}", "subsubsection{}", "paragraph{}", "chapter{}",
  "textbf{}", "textit{}", "emph{}", "texttt{}", "underline{}", "textsc{}",
  "cite{}", "citep{}", "citet{}", "ref{}", "eqref{}", "label{}", "autoref{}", "cref{}",
  "begin{}", "end{}", "item ", "includegraphics[width=\\linewidth]{}", "caption{}", "centering",
  "frac{}{}", "sqrt{}", "sum_{}^{}", "int_{}^{}", "prod", "lim_{}", "infty", "partial", "nabla",
  "alpha", "beta", "gamma", "delta", "epsilon", "varepsilon", "theta", "lambda", "mu", "sigma", "phi", "omega",
  "mathbb{}", "mathcal{}", "mathbf{}", "mathrm{}", "operatorname{}", "left(", "right)", "cdot", "times",
  "leq", "geq", "neq", "approx", "sim", "in", "subseteq", "rightarrow", "Rightarrow", "mapsto",
  "usepackage{}", "documentclass{}", "title{}", "author{}", "date{}", "maketitle", "tableofcontents",
  "footnote{}", "url{}", "href{}{}", "newcommand{}{}", "bibliography{}", "bibliographystyle{}",
  "hline", "toprule", "midrule", "bottomrule", "vspace{}", "hspace{}", "newpage", "noindent",
];

const ENVS = [
  "equation", "equation*", "align", "align*", "gather", "itemize", "enumerate", "description",
  "figure", "table", "tabular", "theorem", "lemma", "proof", "definition", "abstract", "center",
  "frame", "minipage", "verbatim", "quote", "cases", "pmatrix", "bmatrix", "tikzpicture",
];

export type EditorHandle = {
  focus: () => void;
  goTo: (line: number) => void;
  getSelection: () => { text: string; from: number; to: number; line: number };
  replaceRange: (from: number, to: number, text: string) => void;
  insertAtCursor: (text: string) => void;
  coordsAt: (pos: number) => { left: number; top: number; bottom: number } | null;
  view: () => EditorView | null;
};

type Props = {
  fileKey: string;
  value: string;
  onChange: (value: string) => void;
  onCompile: () => void;
  onInlineAI: () => void;
  onCursor?: (line: number) => void;
  diagnostics: CompileError[];
  labels: string[];
  bibKeys: string[];
  fontSize: number;
};

export const LatexEditor = forwardRef<EditorHandle, Props>(function LatexEditor(props, ref) {
  const host = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const states = useRef(new Map<string, EditorState>());
  const currentKey = useRef<string>("");
  const latest = useRef(props);
  latest.current = props;
  const lintCompartment = useRef(new Compartment());

  const completions = (ctx: CompletionContext): CompletionResult | null => {
    const refMatch = ctx.matchBefore(/\\(?:ref|eqref|autoref|cref|Cref|pageref)\{[^}]*/);
    if (refMatch) {
      const start = refMatch.text.indexOf("{") + 1;
      return {
        from: refMatch.from + start,
        options: latest.current.labels.map((l) => ({ label: l, type: "variable", detail: "label" })),
        validFor: /^[^}]*$/,
      };
    }
    const citeMatch = ctx.matchBefore(/\\(?:cite|citep|citet|citeauthor|parencite|textcite)(?:\[[^\]]*\])?\{[^}]*/);
    if (citeMatch) {
      const brace = citeMatch.text.lastIndexOf("{");
      const comma = citeMatch.text.lastIndexOf(",");
      const start = Math.max(brace, comma) + 1;
      return {
        from: citeMatch.from + start,
        options: latest.current.bibKeys.map((k) => ({ label: k, type: "constant", detail: "bib" })),
        validFor: /^[^},]*$/,
      };
    }
    const envMatch = ctx.matchBefore(/\\(?:begin|end)\{[^}]*/);
    if (envMatch) {
      const start = envMatch.text.indexOf("{") + 1;
      return { from: envMatch.from + start, options: ENVS.map((e) => ({ label: e, type: "type" })), validFor: /^[\w*]*$/ };
    }
    const cmd = ctx.matchBefore(/\\[a-zA-Z]*/);
    if (!cmd || (cmd.from === cmd.to && !ctx.explicit)) return null;
    return {
      from: cmd.from + 1,
      options: COMMANDS.map((c) => {
        const name = c.replace(/[{[(].*$/, "").trim();
        return {
          label: name,
          type: "keyword",
          apply: (view: EditorView, _c: unknown, from: number, to: number) => {
            const insert = c;
            const cursorOffset = insert.indexOf("{}") >= 0 ? insert.indexOf("{}") + 1 : insert.length;
            view.dispatch({
              changes: { from, to, insert },
              selection: EditorSelection.cursor(from + cursorOffset),
            });
          },
        };
      }),
      validFor: /^[a-zA-Z]*$/,
    };
  };

  const makeState = (doc: string): EditorState => {
    const extensions: Extension[] = [
      lineNumbers(),
      highlightActiveLineGutter(),
      foldGutter(),
      history(),
      drawSelection(),
      indentOnInput(),
      bracketMatching(),
      closeBrackets(),
      rectangularSelection(),
      highlightActiveLine(),
      highlightSelectionMatches(),
      search({ top: true }),
      autocompletion({ override: [completions], icons: false }),
      latexLang,
      syntaxHighlighting(highlight),
      theme,
      EditorView.lineWrapping,
      placeholder("Start typing LaTeX…"),
      lintCompartment.current.of([]),
      keymap.of([
        {
          key: "Mod-s",
          preventDefault: true,
          run: () => {
            latest.current.onCompile();
            return true;
          },
        },
        {
          key: "Mod-Enter",
          preventDefault: true,
          run: () => {
            latest.current.onCompile();
            return true;
          },
        },
        {
          key: "Mod-k",
          preventDefault: true,
          run: () => {
            latest.current.onInlineAI();
            return true;
          },
        },
        { key: "Mod-/", run: toggleComment },
        ...closeBracketsKeymap,
        ...defaultKeymap,
        ...searchKeymap,
        ...historyKeymap,
        ...completionKeymap,
        indentWithTab,
      ]),
      EditorView.updateListener.of((u) => {
        if (u.docChanged) latest.current.onChange(u.state.doc.toString());
        if (u.selectionSet || u.docChanged) {
          latest.current.onCursor?.(u.state.doc.lineAt(u.state.selection.main.head).number);
        }
      }),
    ];
    return EditorState.create({ doc, extensions });
  };

  // Create the view once, already holding the current file's full state.
  useEffect(() => {
    const p = latest.current;
    const view = new EditorView({ parent: host.current!, state: makeState(p.value) });
    currentKey.current = p.fileKey;
    states.current.clear();
    viewRef.current = view;
    view.dispatch({ effects: lintCompartment.current.reconfigure(lintExt(p.diagnostics, p.fileKey)) });
    return () => {
      view.destroy();
      viewRef.current = null;
      currentKey.current = "";
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Switch files / sync external content changes.
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    if (currentKey.current !== props.fileKey) {
      if (currentKey.current) states.current.set(currentKey.current, view.state);
      currentKey.current = props.fileKey;
      const saved = states.current.get(props.fileKey);
      const state = saved && saved.doc.toString() === props.value ? saved : makeState(props.value);
      view.setState(state);
      view.dispatch({ effects: lintCompartment.current.reconfigure(lintExt(props.diagnostics, props.fileKey)) });
      return;
    }
    const current = view.state.doc.toString();
    if (current !== props.value) {
      // External change (AI edit applied): replace the minimal differing range so undo works nicely.
      let start = 0;
      while (start < current.length && start < props.value.length && current[start] === props.value[start]) start++;
      let endA = current.length;
      let endB = props.value.length;
      while (endA > start && endB > start && current[endA - 1] === props.value[endB - 1]) {
        endA--;
        endB--;
      }
      view.dispatch({ changes: { from: start, to: endA, insert: props.value.slice(start, endB) } });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.fileKey, props.value]);

  // Diagnostics from the last compile.
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({ effects: lintCompartment.current.reconfigure(lintExt(props.diagnostics, props.fileKey)) });
    forceLinting(view);
  }, [props.diagnostics, props.fileKey]);

  useImperativeHandle(ref, () => ({
    focus: () => viewRef.current?.focus(),
    goTo: (line: number) => {
      const view = viewRef.current;
      if (!view) return;
      const l = view.state.doc.line(Math.max(1, Math.min(line, view.state.doc.lines)));
      view.dispatch({ selection: { anchor: l.from }, effects: EditorView.scrollIntoView(l.from, { y: "center" }) });
      view.focus();
    },
    getSelection: () => {
      const view = viewRef.current!;
      const sel = view.state.selection.main;
      return {
        text: view.state.sliceDoc(sel.from, sel.to),
        from: sel.from,
        to: sel.to,
        line: view.state.doc.lineAt(sel.from).number,
      };
    },
    replaceRange: (from, to, text) => {
      const view = viewRef.current;
      if (!view) return;
      view.dispatch({ changes: { from, to, insert: text }, selection: { anchor: from, head: from + text.length } });
      view.focus();
    },
    insertAtCursor: (text) => {
      const view = viewRef.current;
      if (!view) return;
      view.dispatch(view.state.replaceSelection(text));
      view.focus();
    },
    coordsAt: (pos) => viewRef.current?.coordsAtPos(pos) ?? null,
    view: () => viewRef.current,
  }));

  return (
    <div
      ref={host}
      className="absolute inset-0 overflow-hidden"
      style={{ ["--cm-font-size" as string]: `${props.fontSize}px` }}
    />
  );
});

function lintExt(errors: CompileError[], file: string): Extension {
  const mine = errors.filter((e) => e.line && (!e.file || e.file === file || e.file.endsWith(`/${file}`)));
  if (!mine.length) return [];
  return linter(
    (view) => {
      const out: Diagnostic[] = [];
      for (const e of mine) {
        if (!e.line || e.line > view.state.doc.lines) continue;
        const line = view.state.doc.line(e.line);
        out.push({
          from: line.from,
          to: Math.max(line.from, line.to),
          severity: e.level === "error" ? "error" : "warning",
          message: e.message,
        });
      }
      return out;
    },
    { delay: 0 },
  );
}
