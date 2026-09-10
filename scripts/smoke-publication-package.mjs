#!/usr/bin/env node
/**
 * Publication package static gates: pins, workflow permissions, runtime completeness.
 */
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

const buildInfo = JSON.parse(fs.readFileSync(path.join(root, "vendor/ciconia/BUILD_INFO.json"), "utf8"));
const WANT = {
  core: "04a0be72727151afc08091e302f609fd51fbefda",
  wasm: buildInfo.artifacts["verovio-toolkit-wasm.js"].sha256,
  js: buildInfo.artifacts["verovio.js"].sha256,
  wheel: "85f1a2dcc5fe4f133c8b25939296a24acb26033e2cbdad79d04bc63145549365",
  pyodide: "314.0.3",
  cdn: "https://cdn.jsdelivr.net/pyodide/v314.0.3/full/",
};

function sha256(rel) {
  return createHash("sha256").update(fs.readFileSync(path.join(root, rel))).digest("hex").toUpperCase();
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const ignore = fs.readFileSync(path.join(root, ".gitignore"), "utf8");
assert(!ignore.includes("vendor/ciconia/verovio-toolkit-wasm.js\n") && !/^vendor\/ciconia\/verovio-toolkit-wasm\.js$/m.test(ignore), "toolkit wasm must not be gitignored");
assert(!/^vendor\/ciconia\/verovio\.js$/m.test(ignore), "verovio.js must not be gitignored");
assert(/verovio-toolkit-wasm\.js\.gz/.test(ignore), ".gz must remain ignored");

assert(fs.existsSync(path.join(root, "vendor/ciconia/verovio-toolkit-wasm.js")), "wasm toolkit missing");
assert(fs.existsSync(path.join(root, "vendor/ciconia/verovio.js")), "verovio.js missing");
assert(sha256("vendor/ciconia/verovio-toolkit-wasm.js") === WANT.wasm, "WASM SHA mismatch");
assert(sha256("vendor/ciconia/verovio.js") === WANT.js, "JS SHA mismatch");
assert(sha256("vendor/mei-scribe/mei_scribe-0.0.1-py3-none-any.whl").toLowerCase() === WANT.wheel, "wheel SHA mismatch");

assert(buildInfo.ciconia_core_sha === WANT.core, "core SHA mismatch");
assert(buildInfo.rc_identity === "CICONIA_WEB_V0_3_RC2_PUBLICATION_SANITIZATION", "BUILD_INFO rc_identity");
const biText = JSON.stringify(buildInfo);
const personalFragments = [
  ["jo", "sea"].join(""),
  ["C:/Us", "ers/"].join(""),
  ["C:\\\\Us", "ers\\\\"].join(""),
  ["App", "Data"].join(""),
  ["Documents/", "Projets"].join(""),
];
for (const frag of personalFragments) {
  assert(!biText.includes(frag), `BUILD_INFO must not expose personal path fragment`);
}
assert(!Object.prototype.hasOwnProperty.call(buildInfo, "local_patch_identity"), "no local_patch_identity");
assert(!Object.prototype.hasOwnProperty.call(buildInfo, "build_cwd"), "no absolute build_cwd field");

const worker = fs.readFileSync(path.join(root, "mei-scribe-worker.mjs"), "utf8");
assert(worker.includes(`PYODIDE_VERSION = "${WANT.pyodide}"`), "Pyodide version pin");
assert(
  /cdn\.jsdelivr\.net\/pyodide\/v\$\{PYODIDE_VERSION\}\/full\//.test(worker) ||
    worker.includes(WANT.cdn),
  "Pyodide CDN pin"
);
assert(!/pyodide\/v?latest/i.test(worker), "no latest pyodide");
assert(!/pyodide\/dev/i.test(worker), "no dev pyodide");

const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
assert(html.includes('src="vendor/ciconia/verovio-toolkit-wasm.js"'), "relative toolkit URL");
assert(!html.includes('src="/'), "no root-absolute script/src in index");
assert(!/localhost|127\.0\.0\.1/.test(html), "no localhost in index");

const viewer = fs.readFileSync(path.join(root, "js/viewer.js"), "utf8");
assert(viewer.includes('fetch("vendor/ciconia/BUILD_INFO.json")'), "relative BUILD_INFO fetch");
assert(!/fetch\("\//.test(viewer), "no root-absolute fetch in viewer");

const app = fs.readFileSync(path.join(root, "js/app.mjs"), "utf8");
assert(!/fetch\("\//.test(app), "no root-absolute fetch in app");
assert(!/localhost|127\.0\.0\.1/.test(app), "no localhost in app");

const client = fs.readFileSync(path.join(root, "js/mei-scribe-client.mjs"), "utf8");
assert(client.includes('new URL("../mei-scribe-worker.mjs", import.meta.url)'), "relative worker URL");

const wf = fs.readFileSync(path.join(root, ".github/workflows/pages.yml"), "utf8");
assert(/permissions:\s*\n\s*contents:\s*read\s*\n\s*pages:\s*write\s*\n\s*id-token:\s*write/m.test(wf), "minimum Pages permissions");
assert(wf.includes("actions/checkout@"), "checkout action");
assert(wf.includes("actions/configure-pages@"), "configure-pages");
assert(wf.includes("actions/upload-pages-artifact@"), "upload-pages-artifact");
assert(wf.includes("actions/deploy-pages@"), "deploy-pages");
assert(!/buildToolkit|emscripten|pip install|npm install/i.test(wf), "no rebuild/install in workflow");
assert(wf.includes("test -f vendor/ciconia/verovio-toolkit-wasm.js"), "workflow verifies toolkit present");

console.log(
  JSON.stringify(
    {
      publicationPackageStatic: "PASS",
      wasmSha: WANT.wasm,
      jsSha: WANT.js,
      wheelSha: WANT.wheel,
      coreSha: WANT.core,
      pyodide: WANT.pyodide,
      pyodideDistribution: "PINNED_CDN",
    },
    null,
    2
  )
);
