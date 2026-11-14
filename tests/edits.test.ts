import assert from "node:assert/strict";
import { test } from "node:test";
import { applyBlock, applyHunk, splitSegments } from "../src/lib/ai/edits.ts";

const reply = `I fixed the typo.

<edit file="main.tex">
<<<<<<< SEARCH
Hello wrold.
=======
Hello world.
>>>>>>> REPLACE
</edit>

And added a section.

<file path="sections/intro.tex">
\\section{Intro}
</file>`;

test("splits prose and edit blocks", () => {
  const segs = splitSegments(reply);
  assert.deepEqual(
    segs.map((s) => s.type),
    ["text", "block", "text", "block"],
  );
  const edit = segs[1];
  assert.ok(edit.type === "block" && edit.block.kind === "edit");
  assert.equal(edit.block.file, "main.tex");
  assert.deepEqual(edit.block.hunks, [{ search: "Hello wrold.", replace: "Hello world." }]);
  assert.equal(edit.block.complete, true);
  const file = segs[3];
  assert.ok(file.type === "block" && file.block.kind === "file");
  assert.equal(file.block.content, "\\section{Intro}");
});

test("marks a half-streamed block as incomplete and hides a partial tag", () => {
  const partial = splitSegments('Working on it.\n\n<edit file="main.tex">\n<<<<<<< SEARCH\nfoo');
  const block = partial.find((s) => s.type === "block");
  assert.ok(block && block.type === "block" && !block.block.complete);
  const typing = splitSegments("Sure, here it is <ed");
  assert.deepEqual(typing, [{ type: "text", text: "Sure, here it is " }]);
});

test("applies hunks exactly, then tolerating trailing whitespace and indentation", () => {
  assert.equal(applyHunk("a\nb\nc", { search: "b", replace: "B" }), "a\nB\nc");
  assert.equal(applyHunk("a  \nb\n", { search: "a\nb", replace: "x" }), "x\n");
  assert.equal(applyHunk("  \\item one\n  \\item two", { search: "\\item two", replace: "\\item 2" }), "  \\item one\n  \\item 2");
  assert.equal(applyHunk("  a\n  b\nc", { search: "a\nb", replace: "x" }), "x\nc");
  assert.equal(applyHunk("abc", { search: "zzz", replace: "y" }), null);
});

test("applyBlock reports which hunk failed", () => {
  const out = applyBlock("one\ntwo", {
    kind: "edit",
    file: "main.tex",
    complete: true,
    hunks: [
      { search: "one", replace: "1" },
      { search: "missing", replace: "x" },
    ],
  });
  assert.equal(out.ok, false);
  assert.match(!out.ok ? out.reason : "", /change 2 of 2/);
});
