#!/usr/bin/env node
/**
 * Machine proof: preview option matrix does not alter downloadable MEI bytes.
 * Uses stored fixture conversion bytes + Viewer option mapping semantics.
 */
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

function sha(buf) {
  return createHash("sha256").update(buf).digest("hex");
}

function waitModule(mod) {
  if (mod.HEAPU8 && typeof mod._vrvToolkit_constructor === "function") {
    return Promise.resolve(mod);
  }
  if (mod.calledRun) return Promise.resolve(mod);
  if (mod.ready) return mod.ready.then(() => mod);
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("timeout")), 120000);
    const prev = mod.onRuntimeInitialized;
    mod.onRuntimeInitialized = () => {
      clearTimeout(t);
      if (typeof prev === "function") prev();
      resolve(mod);
    };
  });
}

const cmnBytes = fs.readFileSync(path.join(root, "fixtures/o-felix.cmn.mei"));
const mensuralBytes = fs.readFileSync(path.join(root, "fixtures/o-felix.mensural.mei"));
const cmnSha0 = sha(cmnBytes);
const mensSha0 = sha(mensuralBytes);

const toolkitPath = path.join(root, "vendor/ciconia/verovio-toolkit-wasm.js");
const verovio = require(toolkitPath);
await waitModule(verovio.module);
const tk = new verovio.toolkit();

const combos = [
  { showLyrics: true, respectSourceSystems: true },
  { showLyrics: false, respectSourceSystems: true },
  { showLyrics: true, respectSourceSystems: false },
  { showLyrics: false, respectSourceSystems: false },
];

function lyricConnectorRectCount(svg) {
  return [...svg.matchAll(/<rect\b[^>]*>/g)]
    .map((m) => m[0])
    .filter((r) => {
      const w = parseFloat((r.match(/\bwidth="([^"]+)"/) || [])[1] || "0");
      const h = parseFloat((r.match(/\bheight="([^"]+)"/) || [])[1] || "0");
      return h > 0 && h <= 40 && w >= 10 && w <= 800;
    }).length;
}

const rows = [];
for (const combo of combos) {
  const options = {
    mdivAll: true,
    scale: 40,
    svgViewBox: true,
    evenNoteSpacing: true,
    mmOutput: false,
    showLyrics: combo.showLyrics,
    breaks: combo.respectSourceSystems ? "encoded" : "auto",
    adjustPageHeight: combo.respectSourceSystems,
  };
  tk.setOptions(options);
  if (!tk.loadData(mensuralBytes.toString("utf8"))) throw new Error("loadData failed");
  tk.redoLayout();
  let svg = "";
  for (let p = 1; p <= tk.getPageCount(); p++) svg += tk.renderToSVG(p);
  const meiAfter = tk.getMEI();
  rows.push({
    combo,
    downloadCmnSha: cmnSha0,
    downloadMensuralSha: mensSha0,
    svgHasSyl: /class="syl"/i.test(svg),
    svgHasAnchored: /anchoredText/i.test(svg),
    connectorRects: lyricConnectorRectCount(svg),
    meiShaAfterRender: sha(Buffer.from(meiAfter, "utf8")),
    pageCount: tk.getPageCount(),
  });
}

const downloadInvariant = rows.every(
  (r) => r.downloadCmnSha === cmnSha0 && r.downloadMensuralSha === mensSha0
);
const lyricsOffHides = rows
  .filter((r) => !r.combo.showLyrics)
  .every((r) => !r.svgHasSyl && r.svgHasAnchored && r.connectorRects === 0);
const lyricsOnShows = rows
  .filter((r) => r.combo.showLyrics)
  .every((r) => r.svgHasSyl && r.svgHasAnchored && r.connectorRects > 0);

const pass = downloadInvariant && lyricsOffHides && lyricsOnShows;
console.log(
  JSON.stringify(
    {
      pass,
      downloadInvariant,
      lyricsOffHides,
      lyricsOnShows,
      cmnSha0,
      mensSha0,
      rows,
    },
    null,
    2
  )
);
process.exit(pass ? 0 : 1);
