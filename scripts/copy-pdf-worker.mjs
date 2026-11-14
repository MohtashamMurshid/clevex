// Copies the pdf.js worker into /public so it is served as a static asset.
import { copyFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const pkg = path.dirname(require.resolve("pdfjs-dist/package.json"));
mkdirSync("public", { recursive: true });
copyFileSync(path.join(pkg, "build", "pdf.worker.min.mjs"), path.join("public", "pdf.worker.min.mjs"));
