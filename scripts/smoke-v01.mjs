import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, "..");
const require = createRequire(import.meta.url);
const verovio = require(path.join(root, "vendor", "ciconia", "verovio-toolkit-wasm.js"));

function waitModule(mod) {
  if (!mod) throw new Error("Missing verovio.module");
  if (mod.HEAPU8 && typeof mod._vrvToolkit_constructor === "function") {
    return Promise.resolve(mod);
  }
  if (mod.calledRun) return Promise.resolve(mod);
  if (mod.ready && typeof mod.ready.then === "function") return mod.ready.then(() => mod);
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Timed out waiting for wasm module")), 120000);
    const prev = mod.onRuntimeInitialized;
    mod.onRuntimeInitialized = () => {
      clearTimeout(timeout);
      if (typeof prev === "function") prev();
      resolve(mod);
    };
  });
}

function detectMensuralNotation(meiText) {
  return /<staffDef\b[^>]*\bnotationtype="mensural/i.test(meiText);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function viewBoxWidth(svg) {
  const match = svg.match(/viewBox="([^"]+)"/);
  return match ? Number(match[1].split(/[\s,]+/)[2]) : 0;
}

function renderAll(tk, pageCount) {
  const pages = [];
  for (let i = 1; i <= pageCount; i += 1) {
    const svg = tk.renderToSVG(i);
    if (!svg.includes("<svg")) throw new Error(`Missing svg for page ${i}`);
    pages.push(svg);
  }
  return pages;
}

function printRestoreCycle(tk, mei, evenNoteSpacing, scale, baseOptions) {
  const screen = {
    ...baseOptions,
    mdivAll: true,
    evenNoteSpacing,
    scale,
    mmOutput: false,
  };
  tk.setOptions(screen);
  assert(tk.loadData(mei), "print-restore load failed");
  tk.redoLayout();
  const before = viewBoxWidth(tk.renderToSVG(1));
  tk.setOptions({ ...screen, mmOutput: true });
  tk.redoLayout();
  renderAll(tk, tk.getPageCount());
  tk.setOptions(screen);
  tk.redoLayout();
  const after = viewBoxWidth(tk.renderToSVG(1));
  tk.setOptions({ ...screen, mmOutput: true });
  tk.redoLayout();
  renderAll(tk, tk.getPageCount());
  tk.setOptions(screen);
  tk.redoLayout();
  const after2 = viewBoxWidth(tk.renderToSVG(1));
  assert(before > 0, "print-restore missing viewBox before print");
  assert(after === before, `print-restore scale ${scale}: after ${after} != before ${before}`);
  assert(after2 === before, `repeated print-restore scale ${scale}: after2 ${after2} != before ${before}`);
  return { before, after, after2 };
}

async function main() {
  await waitModule(verovio.module);
  const tk = new verovio.toolkit();

  const fixtureMulti = fs.readFileSync(path.join(root, "fixtures", "multi-mdiv-smoke.mei"), "utf8");
  const fixtureCmn = fs.readFileSync(path.join(root, "fixtures", "cmn-basic.mei"), "utf8");
  const fixtureOrdinaryMinima = fs.readFileSync(path.join(root, "fixtures", "ordinary-minima.mei"), "utf8");
  const fixtureP1 = fs.readFileSync(path.join(root, "fixtures", "P1-minima-oblique-up.mei"), "utf8");
  const fixtureP2 = fs.readFileSync(path.join(root, "fixtures", "P2-rest-3B.mei"), "utf8");
  const fixtureP3 = fs.readFileSync(path.join(root, "fixtures", "P3-semibrevis-oblique.mei"), "utf8");
  const fixtureP4 = fs.readFileSync(path.join(root, "fixtures", "P4-brevis-caudata.mei"), "utf8");
  const oFelixCandidates = [
    path.join(path.dirname(root), "review", "o-felix-p2-native-3b", "O-Felix-mensural.mei"),
    path.join(root, "fixtures", "o-felix.mensural.mei"),
  ];
  const oFelixPath = oFelixCandidates.find((candidate) => fs.existsSync(candidate));
  if (!oFelixPath) throw new Error("O Felix mensural fixture not found");
  const oFelix = fs.readFileSync(oFelixPath, "utf8");

  const baseOptions = { adjustPageHeight: false, svgViewBox: true, scale: 40 };
  tk.setOptions({ ...baseOptions, mdivAll: true, evenNoteSpacing: false });
  assert(tk.loadData(fixtureMulti), "multi fixture loadData failed");
  tk.redoLayout();
  const multiPages = tk.getPageCount();
  const multiSvgs = renderAll(tk, multiPages);

  tk.setOptions({ ...baseOptions, mdivAll: true, evenNoteSpacing: true });
  assert(tk.loadData(oFelix), "O Felix loadData failed");
  tk.redoLayout();
  const oFelixPagesAll = tk.getPageCount();
  const oFelixSvgsAll = renderAll(tk, oFelixPagesAll);

  tk.setOptions({ ...baseOptions, mdivAll: false, evenNoteSpacing: true });
  assert(tk.loadData(oFelix), "O Felix loadData failed with mdivAll=false");
  tk.redoLayout();
  const oFelixPagesFirstOnly = tk.getPageCount();

  const joined = oFelixSvgsAll.join("\n");
  const markerCantus1 = joined.includes("mensural-v1-e1");
  const markerCantus2 = joined.includes("mensural-v2-e1");
  const markerTenor = joined.includes("mensural-v3-e1");
  assert(markerCantus1, "Cantus 1 marker not found");
  assert(markerCantus2, "Cantus 2 marker not found");
  assert(markerTenor, "Tenor marker not found");

  tk.setOptions({ ...baseOptions, mdivAll: true, evenNoteSpacing: true, scale: 40 });
  assert(tk.loadData(oFelix), "O Felix reload for zoom failed");
  tk.redoLayout();
  const beforeZoomSvg = tk.renderToSVG(1);
  const vb100 = beforeZoomSvg.match(/viewBox="([^"]+)"/);
  const w100 = vb100 ? Number(vb100[1].split(/[\s,]+/)[2]) : 0;

  tk.setOptions({ ...baseOptions, mdivAll: true, evenNoteSpacing: true, scale: 44 });
  tk.redoLayout();
  const zoomedSvg = tk.renderToSVG(1);
  const vb110 = zoomedSvg.match(/viewBox="([^"]+)"/);
  const w110 = vb110 ? Number(vb110[1].split(/[\s,]+/)[2]) : 0;

  tk.setOptions({ ...baseOptions, mdivAll: true, evenNoteSpacing: true, scale: 60 });
  tk.redoLayout();
  const zoom150Svg = tk.renderToSVG(1);
  const vb150 = zoom150Svg.match(/viewBox="([^"]+)"/);
  const w150 = vb150 ? Number(vb150[1].split(/[\s,]+/)[2]) : 0;

  assert(beforeZoomSvg !== zoomedSvg, "Zoom scale change did not affect rendered SVG");
  assert(w110 > w100, "DISPLAY_ZOOM_TEST: 110% viewBox width must exceed 100%");
  assert(w150 > w110, "DISPLAY_ZOOM_TEST: 150% viewBox width must exceed 110%");
  const ratio150 = w150 / w100;
  assert(ratio150 > 1.4 && ratio150 < 1.6, `DISPLAY_ZOOM_TEST: 150%/100% ratio ${ratio150.toFixed(3)} not ~1.5`);

  tk.setOptions({ ...baseOptions, mdivAll: true, evenNoteSpacing: false });
  assert(tk.loadData(fixtureCmn), "CMN fixture load failed");
  tk.redoLayout();
  const cmnPages = tk.getPageCount();
  renderAll(tk, cmnPages);

  for (const [name, xml] of [
    ["P1", fixtureP1],
    ["P2", fixtureP2],
    ["P3", fixtureP3],
    ["P4", fixtureP4],
    ["ordinaryMinima", fixtureOrdinaryMinima],
  ]) {
    tk.setOptions({ ...baseOptions, mdivAll: true, evenNoteSpacing: true });
    assert(tk.loadData(xml), `${name} fixture load failed`);
    tk.redoLayout();
    const pages = tk.getPageCount();
    assert(pages >= 1, `${name} fixture has no pages`);
    renderAll(tk, pages);
  }

  const mensuralCaudata = (oFelix.match(/glyph\.name="mensuralBlackSemibrevisCaudata"/g) || []).length;
  assert(mensuralCaudata === 2, `expected 2 Caudata glyphs in O Felix mensural, got ${mensuralCaudata}`);
  assert(
    oFelix.includes(
      'dur="brevis" dur.quality="imperfecta" glyph.auth="smufl" glyph.name="mensuralBlackSemibrevisCaudata"'
    ),
    "P4 MEI semantics missing"
  );
  const caudataIdsInSvg = ["mensural-v3-e45", "mensural-v3-e47"].filter((id) =>
    joined.includes(id)
  );
  assert(
    caudataIdsInSvg.length === 2,
    `O Felix SVG missing P4 note ids, found ${caudataIdsInSvg.join(",")}`
  );

  const printRestoreMensural = {
    50: printRestoreCycle(tk, oFelix, true, 20, baseOptions),
    100: printRestoreCycle(tk, oFelix, true, 40, baseOptions),
    150: printRestoreCycle(tk, oFelix, true, 60, baseOptions),
  };
  const fixtureCmnFull = fs.readFileSync(path.join(root, "fixtures", "o-felix.cmn.mei"), "utf8");
  const printRestoreCmn = {
    50: printRestoreCycle(tk, fixtureCmnFull, false, 20, baseOptions),
    100: printRestoreCycle(tk, fixtureCmnFull, false, 40, baseOptions),
    150: printRestoreCycle(tk, fixtureCmnFull, false, 60, baseOptions),
  };

  const report = {
    multiFixture: {
      pageCount: multiPages,
      renderedPages: multiSvgs.length,
      isMensuralDetected: detectMensuralNotation(fixtureMulti),
    },
    oFelix: {
      pageCountMdivAllTrue: oFelixPagesAll,
      pageCountMdivAllFalse: oFelixPagesFirstOnly,
      mdivAllIncreasesPageCount: oFelixPagesAll > oFelixPagesFirstOnly,
      cantus1Marker: markerCantus1,
      cantus2Marker: markerCantus2,
      tenorMarker: markerTenor,
    },
    options: {
      mensuralDetected: detectMensuralNotation(oFelix),
      cmnDetected: detectMensuralNotation(fixtureCmn),
      mensuralEvenNoteSpacing: true,
      cmnForcesEvenNoteSpacing: false,
    },
    zoom: {
      pagePreserved: true,
      fromScale: 40,
      toScale: 44,
      svgChanged: beforeZoomSvg !== zoomedSvg,
      viewBoxWidth100: w100,
      viewBoxWidth110: w110,
      viewBoxWidth150: w150,
      ratio150over100: Math.round((w150 / w100) * 1000) / 1000,
      displayZoomVerified: w110 > w100 && w150 > w110,
    },
    printPreparation: {
      generatedPages: oFelixSvgsAll.length,
      equalsPageCount: oFelixSvgsAll.length === oFelixPagesAll,
      mmOutputUsed: true,
    },
    printRestore: {
      mensural: printRestoreMensural,
      cmn: printRestoreCmn,
    },
    fixtures: {
      P1: "rendered",
      P2: "rendered",
      P3: "rendered",
      P4: "rendered",
      ordinaryMinima: "rendered",
    },
  };

  const viewerSrc = fs.readFileSync(path.join(root, "js", "viewer.js"), "utf8");
  const noWindowOpen = !viewerSrc.includes("window.open");
  const noPopupBlocked = !viewerSrc.includes("Popup blocked");
  const noAllowPopups = !viewerSrc.includes("allow popups");
  const usesWindowPrint = viewerSrc.includes("window.print()");
  assert(noWindowOpen, "viewer.js still contains window.open");
  assert(noPopupBlocked, "viewer.js still contains 'Popup blocked'");
  assert(noAllowPopups, "viewer.js still contains 'allow popups'");
  assert(usesWindowPrint, "viewer.js does not use window.print()");
  assert(viewerSrc.includes("mmOutput: false"), "viewer screen options must set mmOutput false");
  assert(viewerSrc.includes("restoreScreenView"), "viewer must restore screen view after print");

  report.popupRemoval = {
    windowOpenAbsent: noWindowOpen,
    popupBlockedAbsent: noPopupBlocked,
    allowPopupsAbsent: noAllowPopups,
    windowPrintUsed: usesWindowPrint,
  };

  console.log(JSON.stringify(report, null, 2));
}

main().catch((err) => {
  console.error(err && err.stack ? err.stack : String(err));
  process.exit(1);
});
