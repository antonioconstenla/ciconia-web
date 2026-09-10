#!/usr/bin/env node
/**
 * HTTP smoke for project-subpath serving (/ciconia-web/).
 * Fails if required same-origin assets 404 or resolve outside the project base.
 */
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const buildInfo = JSON.parse(fs.readFileSync(path.join(root, "vendor/ciconia/BUILD_INFO.json"), "utf8"));
const WANT_WASM = buildInfo.artifacts["verovio-toolkit-wasm.js"].sha256;
const base = process.argv[2] || "http://127.0.0.1:8788/ciconia-web/";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function get(rel, opts = {}) {
  const url = new URL(rel, base).href;
  const res = await fetch(url, { redirect: "manual" });
  const buf = Buffer.from(await res.arrayBuffer());
  return { url, res, buf, text: buf.toString("utf8") };
}

const checks = [
  "index.html",
  "css/viewer.css",
  "js/app.mjs",
  "js/viewer.js",
  "js/mei-scribe-client.mjs",
  "mei-scribe-worker.mjs",
  "vendor/ciconia/BUILD_INFO.json",
  "vendor/ciconia/verovio-toolkit-wasm.js",
  "vendor/ciconia/verovio.js",
  "vendor/mei-scribe/mei_scribe-0.0.1-py3-none-any.whl",
  "vendor/mei-scribe/WHEEL_PROVENANCE.txt",
  "fixtures/o-felix-basic.mei",
];

const results = [];
for (const rel of checks) {
  const { url, res, buf } = await get(rel);
  assert(res.status === 200, `${rel} -> ${res.status} (${url})`);
  assert(url.includes("/ciconia-web/"), `${rel} must stay under /ciconia-web/: ${url}`);
  results.push({ rel, status: res.status, bytes: buf.length, sha256: createHash("sha256").update(buf).digest("hex").toUpperCase() });
}

const wasm = results.find((r) => r.rel.endsWith("verovio-toolkit-wasm.js"));
assert(wasm.sha256 === WANT_WASM, "served WASM SHA mismatch");

// Root outside project base must not serve the app
const rootProbe = await fetch(new URL("/", base).origin + "/", { redirect: "manual" });
assert(rootProbe.status >= 400, "repository root must not serve publication index");

const worker = (await get("mei-scribe-worker.mjs")).text;
assert(
  worker.includes('PYODIDE_VERSION = "314.0.3"') &&
    (/cdn\.jsdelivr\.net\/pyodide\/v\$\{PYODIDE_VERSION\}\/full\//.test(worker) ||
      worker.includes("cdn.jsdelivr.net/pyodide/v314.0.3/full/")),
  "worker pin visible over HTTP"
);

const index = (await get("")).text.length ? (await get("index.html")).text : "";
const indexHtml = (await get("index.html")).text;
assert(indexHtml.includes("vendor/ciconia/verovio-toolkit-wasm.js"), "index references relative toolkit");
assert(!indexHtml.includes('src="/vendor'), "index must not use root-absolute vendor");

console.log(
  JSON.stringify(
    {
      subpathHttpSmoke: "PASS",
      base,
      assets: results.length,
      wasmSha: wasm.sha256,
      rootOutsideBaseRejected: true,
    },
    null,
    2
  )
);
