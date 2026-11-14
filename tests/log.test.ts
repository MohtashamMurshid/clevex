import assert from "node:assert/strict";
import { test } from "node:test";
import { parseLatexLog } from "../src/lib/latex/log.ts";

test("parses Tectonic errors and drops engine noise", () => {
  const log = [
    "error: main.tex:19: Undefined control sequence",
    "error: halted on potentially-recoverable error as specified",
    "error: the XeTeX engine had an unrecoverable error",
    "! Undefined control sequence.",
    "l.19 \\badcommand",
    "LaTeX Warning: Citation `foo' on page 1 undefined on input line 30.",
  ].join("\n");
  const errors = parseLatexLog(log);
  assert.deepEqual(
    errors.map((e) => [e.level, e.line, e.message]),
    [
      ["error", 19, "Undefined control sequence"],
      ["warning", 30, "Citation `foo' on page 1 undefined on input line 30."],
    ],
  );
});
