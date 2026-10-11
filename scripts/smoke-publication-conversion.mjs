#!/usr/bin/env node
/**
 * Publication conversion pin gate (Node).
 * Full browser conversion under /ciconia-web/ is evidenced separately;
 * Node 24 cannot import the HTTPS Pyodide ESM URL used by the worker.
 */
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const worker = fs.readFileSync(path.join(root, "mei-scribe-worker.mjs"), "utf8");
const wheel = fs.readFileSync(
  path.join(root, "vendor/mei-scribe/mei_scribe-0.0.1-py3-none-any.whl")
);
const sha = createHash("sha256").update(wheel).digest("hex");
if (!worker.includes('PYODIDE_VERSION = "314.0.3"')) throw new Error("pyodide pin missing");
if (!/cdn\.jsdelivr\.net\/pyodide\/v\$\{PYODIDE_VERSION\}\/full\//.test(worker)) {
  throw new Error("CDN template pin missing");
}
if (sha !== "06919386619211f437174b480efae745ace017482664892c5926575688639b46") {
  throw new Error("wheel sha mismatch");
}
console.log(
  JSON.stringify(
    {
      publicationConversionPins: "PASS",
      note: "Browser CDP conversion under /ciconia-web/ is the runtime proof",
      wheelSha: sha,
      pyodide: "314.0.3",
    },
    null,
    2
  )
);
