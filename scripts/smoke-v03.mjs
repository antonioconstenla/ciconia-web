import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, "..");

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const app = read("js/app.mjs");
const viewer = read("js/viewer.js");
const html = read("index.html");
const css = read("css/viewer.css");
const provenance = read("vendor/mei-scribe/WHEEL_PROVENANCE.txt");
const buildInfo = JSON.parse(read("vendor/ciconia/BUILD_INFO.json"));
const toolkit = fs.readFileSync(path.join(root, "vendor/ciconia/verovio-toolkit-wasm.js"));

assert(html.includes("Mensural preview"), "Mensural preview legend missing");
assert(html.includes("Lyrics"), "Lyrics control missing");
assert(html.includes("Respect source systems"), "source systems control missing");
assert(html.includes("<summary>Report a problem</summary>"), "Report a problem control missing");
assert(html.includes('id="preview-lyrics"'), "preview-lyrics id missing");
assert(html.includes('id="preview-source-systems"'), "preview-source-systems id missing");
assert(!html.includes("Aperçu mensural"), "French mensural legend must be removed");
assert(!html.includes("Paroles"), "French Paroles label must be removed");
assert(!html.includes("Respecter les systèmes de la source"), "French source-systems label must be removed");
assert(viewer.includes('"lyrics on"'), "status must say lyrics on");
assert(viewer.includes('"lyrics off"'), "status must say lyrics off");
assert(!/paroles/i.test(viewer), "viewer must not retain paroles status wording");
assert(!/paroles/i.test(html), "html must not retain paroles wording");
assert(css.includes("report-problem"), "report-problem styles missing");
assert(viewer.includes("setPreviewOptions"), "setPreviewOptions missing");
assert(viewer.includes("showLyrics"), "showLyrics wiring missing");
assert(viewer.includes('breaks: respectSourceSystems ? "encoded" : "auto"'), "breaks mapping missing");
assert(viewer.includes("applyPreviewRerender"), "preview rerender missing");
assert(!/setPreviewOptions[\s\S]{0,800}loadData/.test(viewer), "setPreviewOptions must not call loadData nearby");
assert(app.includes("conversionCount: app.conversionCount"), "conversionCount must be exposed");
assert(css.includes("preview-controls"), "preview control styles missing");
assert(toolkit.includes("showLyrics"), "toolkit must expose showLyrics");
assert(
  buildInfo.ciconia_core_sha === "04a0be72727151afc08091e302f609fd51fbefda",
  "BUILD_INFO must pin clean core commit 04a0be7"
);
assert(!Object.prototype.hasOwnProperty.call(buildInfo, "local_patch_identity"), "RC BUILD_INFO must not use local_patch_identity");
assert(provenance.includes("f0d0ea6e51ccea9ddcd66f3126dcc1ec448333c9"), "wheel provenance must pin mei-scriber commit");

const wheel = path.join(root, "vendor", "mei-scribe", "mei_scribe-0.0.1-py3-none-any.whl");
const wheelSha = createHash("sha256").update(fs.readFileSync(wheel)).digest("hex");
assert(
  wheelSha === "06919386619211f437174b480efae745ace017482664892c5926575688639b46",
  "wheel SHA mismatch vs f0d0ea6 build"
);

const mensural = fs.readFileSync(path.join(root, "fixtures", "o-felix.mensural.mei"));
assert(
  createHash("sha256").update(mensural).digest("hex") ===
    "5ee4e6b8cbccee7e28664846ad0b6397e8ec31dcfc71575f38c97b567ba09d61",
  "mensural fixture SHA mismatch"
);

console.log(
  JSON.stringify(
    {
      staticArchitecture: "PASS",
      previewControls: true,
      toolkitHasShowLyrics: true,
      wheelSha,
      coreSha: buildInfo.ciconia_core_sha,
      toolkitSha: buildInfo.artifacts["verovio-toolkit-wasm.js"].sha256,
    },
    null,
    2
  )
);
