import { createMeiScribeClient } from "./mei-scribe-client.mjs";

const EXPECTED_CMN_SHA =
  "9a4ec3640502585701c8d071386683163aa7bf8cda093214e3ab292b51f540b0";
const EXPECTED_MENSURAL_SHA =
  "5ee4e6b8cbccee7e28664846ad0b6397e8ec31dcfc71575f38c97b567ba09d61";

const AppState = {
  HOME: "HOME",
  LOADING_EXISTING_MEI: "LOADING_EXISTING_MEI",
  VIEWING_EXISTING_MEI: "VIEWING_EXISTING_MEI",
  PREPARING_CONVERTER: "PREPARING_CONVERTER",
  CONVERTING_BASIC: "CONVERTING_BASIC",
  CONVERSION_RESULT: "CONVERSION_RESULT",
  VIEWING_CMN: "VIEWING_CMN",
  VIEWING_MENSURAL: "VIEWING_MENSURAL",
  ERROR: "ERROR",
};

const els = {
  body: document.body,
  status: document.getElementById("status"),
  home: document.getElementById("home-panel"),
  dropzone: document.getElementById("dropzone"),
  open: document.getElementById("open-mei"),
  pending: document.getElementById("pending-file"),
  pendingKind: document.getElementById("pending-kind"),
  pendingName: document.getElementById("pending-name"),
  pendingHint: document.getElementById("pending-hint"),
  viewExisting: document.getElementById("view-existing"),
  convertBasic: document.getElementById("convert-basic"),
  results: document.getElementById("results-panel"),
  warningSummary: document.getElementById("warning-summary"),
  warningList: document.getElementById("warning-list"),
  warningTech: document.getElementById("warning-tech"),
  viewCmn: document.getElementById("view-cmn"),
  downloadCmn: document.getElementById("download-cmn"),
  viewMensural: document.getElementById("view-mensural"),
  downloadMensural: document.getElementById("download-mensural"),
  backResults: document.getElementById("back-results"),
  newFile: document.getElementById("new-file"),
  resultsNewFile: document.getElementById("results-new-file"),
  errorNewFile: document.getElementById("error-new-file"),
  errorPanel: document.getElementById("error-panel"),
  errorMessage: document.getElementById("error-message"),
  errorTech: document.getElementById("error-tech"),
  score: document.getElementById("score"),
  viewerChrome: document.getElementById("viewer-chrome"),
};

const client = createMeiScribeClient();

const app = {
  state: AppState.HOME,
  pendingFile: null,
  currentConversion: null,
  lastError: null,
  timings: {
    existingOpenMs: null,
    pyodideReadyMs: null,
    firstConversionMs: null,
    secondConversionMs: null,
    renderAfterConversionMs: null,
  },
  conversionCount: 0,
  pyodideInitialized: false,
};

function setAppState(next) {
  app.state = next;
  els.body.dataset.appState = next;
  els.home.hidden = !(
    next === AppState.HOME ||
    next === AppState.LOADING_EXISTING_MEI ||
    next === AppState.PREPARING_CONVERTER ||
    next === AppState.CONVERTING_BASIC
  );
  els.results.hidden = next !== AppState.CONVERSION_RESULT;
  els.errorPanel.hidden = next !== AppState.ERROR;
  const viewing =
    next === AppState.VIEWING_EXISTING_MEI ||
    next === AppState.VIEWING_CMN ||
    next === AppState.VIEWING_MENSURAL;
  els.viewerChrome.hidden = !viewing;
  els.score.hidden = !viewing;
  els.backResults.hidden = !(
    next === AppState.VIEWING_CMN || next === AppState.VIEWING_MENSURAL
  );
  const fromConversion =
    next === AppState.VIEWING_CMN ||
    next === AppState.VIEWING_MENSURAL ||
    next === AppState.CONVERSION_RESULT;
  els.newFile.hidden = !(viewing || fromConversion || next === AppState.ERROR);
}

function setStatus(text, isError = false) {
  els.status.textContent = text;
  els.status.classList.toggle("error", isError);
}

function whenViewerReady() {
  if (window.__ciconiaViewer) return Promise.resolve(window.__ciconiaViewer);
  return new Promise((resolve) => {
    window.addEventListener(
      "ciconia-ready",
      () => resolve(window.__ciconiaViewer),
      { once: true }
    );
  });
}

function classifyMei(text) {
  const versionMatch = text.match(/\bmeiversion="([^"]+)"/i);
  const version = (versionMatch?.[1] || "").toLowerCase();
  if (version.includes("+basic")) return "basic";
  return "existing";
}

function applyPendingUi(kind, filename) {
  els.pending.hidden = false;
  els.pendingName.textContent = filename;
  els.convertBasic.classList.toggle("primary", kind === "basic");
  els.viewExisting.classList.toggle("primary", kind !== "basic");
  if (kind === "basic") {
    els.pendingKind.textContent = "MuseScore MEI Basic source";
    els.convertBasic.textContent = "Convert";
    els.viewExisting.textContent = "View source (unconverted)";
    els.pendingHint.textContent =
      "The source view shows the MEI as exported. Mensural transcription rules are applied only after conversion.";
    els.convertBasic.focus();
  } else {
    els.pendingKind.textContent = "Existing MEI";
    els.convertBasic.textContent = "Convert";
    els.viewExisting.textContent = "View";
    els.pendingHint.textContent = "Open this score in the Viewer.";
    els.viewExisting.focus();
  }
}

function humanVoice(identity) {
  if (!identity) return null;
  const numbered = /^voice-(\d+)$/i.exec(identity);
  if (numbered) return `Voice ${numbered[1]}`;
  return identity;
}

function humanDiagnostic(item) {
  if (item.code === "deferred-custos") return "Custos not yet emitted";
  return item.message || item.code || "Warning";
}

function diagnosticPlace(item) {
  const parts = [];
  const voice = humanVoice(item.voice_identity);
  if (voice) parts.push(voice);
  if (item.measure_n != null) parts.push(`measure ${item.measure_n}`);
  return parts.join(" · ");
}

function downloadBytes(name, bytes) {
  const blob = new Blob([bytes], { type: "application/xml" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

async function sha256Hex(bytes) {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function pyodideResourceCount() {
  return performance
    .getEntriesByType("resource")
    .filter((entry) => /pyodide|micropip/i.test(entry.name)).length;
}

function acceptMeiFile(file) {
  const name = file.name || "";
  if (/\.mscz$/i.test(name)) {
    throw new Error("MuseScore .mscz files are not accepted. Export MEI Basic first.");
  }
  if (!/\.(mei|xml)$/i.test(name)) {
    throw new Error("Please choose an .mei or .xml file.");
  }
  return true;
}

async function readPendingFile(file) {
  acceptMeiFile(file);
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  const text = new TextDecoder("utf-8").decode(bytes);
  const kind = classifyMei(text);
  app.pendingFile = {
    name: file.name,
    bytes,
    text,
    kind,
  };
  applyPendingUi(kind, file.name);
}

async function viewExistingFromPending() {
  if (!app.pendingFile) return;
  const viewer = await whenViewerReady();
  setAppState(AppState.LOADING_EXISTING_MEI);
  setStatus("Opening MEI…");
  const t0 = performance.now();
  viewer.loadMei(app.pendingFile.text, app.pendingFile.name);
  app.timings.existingOpenMs = performance.now() - t0;
  setAppState(AppState.VIEWING_EXISTING_MEI);
  if (app.pendingFile.kind === "basic") {
    setStatus("Viewing unconverted source MEI.");
  }
}

async function ensureConverterReady() {
  if (app.pyodideInitialized) return;
  setAppState(AppState.PREPARING_CONVERTER);
  setStatus("Preparing converter…");
  const ready = await client.initialize();
  app.pyodideInitialized = true;
  app.timings.pyodideReadyMs = ready.initTimings?.totalReadyMs ?? null;
}

async function convertPending() {
  if (!app.pendingFile) return;
  try {
    await ensureConverterReady();
    setAppState(AppState.CONVERTING_BASIC);
    setStatus("Converting…");
    const copy = app.pendingFile.bytes.slice().buffer;
    const raw = await client.convert(copy, app.pendingFile.name);
    const cmnBytes = raw.cmnBytes instanceof Uint8Array ? raw.cmnBytes : new Uint8Array(raw.cmnBytes);
    const mensuralBytes =
      raw.mensuralBytes instanceof Uint8Array
        ? raw.mensuralBytes
        : new Uint8Array(raw.mensuralBytes);
    const result = {
      sourceName: app.pendingFile.name,
      cmnBytes,
      mensuralBytes,
      diagnostics: raw.diagnostics || [],
      metadata: raw.metadata || {},
      cmnFilename: raw.metadata?.suggested_output_names?.cmn_name || "output.cmn.mei",
      mensuralFilename:
        raw.metadata?.suggested_output_names?.mensural_name || "output.mensural.mei",
      cmnSha: await sha256Hex(cmnBytes),
      mensuralSha: await sha256Hex(mensuralBytes),
      conversionMs: raw.conversionMs,
      resourceCountBefore: raw.resourceCountBefore,
      resourceCountAfter: raw.resourceCountAfter,
    };
    app.conversionCount += 1;
    if (app.conversionCount === 1) app.timings.firstConversionMs = result.conversionMs;
    else app.timings.secondConversionMs = result.conversionMs;
    app.currentConversion = result;
    app.lastError = null;
    renderResults(result);
    setAppState(AppState.CONVERSION_RESULT);
    setStatus("Conversion complete");
    return result;
  } catch (error) {
    showError(error);
    throw error;
  }
}

function renderResults(result) {
  const warnings = result.diagnostics.filter((item) => item.severity === "WARNING");
  const count = result.metadata.warning_count ?? warnings.length;
  els.warningSummary.textContent = count === 1 ? "1 warning" : `${count} warnings`;
  els.warningList.replaceChildren();
  for (const item of warnings) {
    const li = document.createElement("li");
    const title = document.createElement("strong");
    title.textContent = humanDiagnostic(item);
    const place = document.createElement("span");
    place.textContent = diagnosticPlace(item);
    li.append(title, document.createTextNode(" "), place);
    els.warningList.append(li);
  }
  els.warningTech.textContent = JSON.stringify(result.diagnostics, null, 2);
}

function showError(error) {
  app.lastError = error;
  setAppState(AppState.ERROR);
  setStatus("Error", true);
  els.errorMessage.textContent =
    "The file could not be interpreted as supported MEI Basic.";
  els.errorTech.textContent = [
    error?.name || "Error",
    error?.message || String(error),
    error?.stack || "",
  ]
    .filter(Boolean)
    .join("\n");
}

async function viewConverted(kind) {
  if (!app.currentConversion) return;
  const viewer = await whenViewerReady();
  const bytes =
    kind === "cmn" ? app.currentConversion.cmnBytes : app.currentConversion.mensuralBytes;
  const filename =
    kind === "cmn"
      ? app.currentConversion.cmnFilename
      : app.currentConversion.mensuralFilename;
  const t0 = performance.now();
  viewer.loadMeiBytes(bytes, filename);
  app.timings.renderAfterConversionMs = performance.now() - t0;
  setAppState(kind === "cmn" ? AppState.VIEWING_CMN : AppState.VIEWING_MENSURAL);
}

function goHome() {
  app.pendingFile = null;
  els.pending.hidden = true;
  els.open.value = "";
  setAppState(AppState.HOME);
  setStatus("Ready");
}

function bindUi() {
  els.open.addEventListener("change", async (event) => {
    const file = event.target.files && event.target.files[0];
    if (!file) return;
    try {
      await readPendingFile(file);
    } catch (error) {
      showError(error);
    }
  });

  ["dragenter", "dragover"].forEach((type) => {
    els.dropzone.addEventListener(type, (event) => {
      event.preventDefault();
      els.dropzone.classList.add("is-dragover");
    });
  });
  ["dragleave", "drop"].forEach((type) => {
    els.dropzone.addEventListener(type, (event) => {
      event.preventDefault();
      els.dropzone.classList.remove("is-dragover");
    });
  });
  els.dropzone.addEventListener("drop", async (event) => {
    const file = event.dataTransfer?.files?.[0];
    if (!file) return;
    try {
      await readPendingFile(file);
    } catch (error) {
      showError(error);
    }
  });

  els.viewExisting.addEventListener("click", () => {
    viewExistingFromPending().catch((error) => showError(error));
  });
  els.convertBasic.addEventListener("click", () => {
    convertPending().catch(() => {});
  });
  els.viewCmn.addEventListener("click", () => viewConverted("cmn"));
  els.viewMensural.addEventListener("click", () => viewConverted("mensural"));
  els.downloadCmn.addEventListener("click", () => {
    if (!app.currentConversion) return;
    downloadBytes(app.currentConversion.cmnFilename, app.currentConversion.cmnBytes);
  });
  els.downloadMensural.addEventListener("click", () => {
    if (!app.currentConversion) return;
    downloadBytes(
      app.currentConversion.mensuralFilename,
      app.currentConversion.mensuralBytes
    );
  });
  els.backResults.addEventListener("click", () => {
    setAppState(AppState.CONVERSION_RESULT);
    setStatus("Conversion complete");
  });
  els.newFile.addEventListener("click", goHome);
  els.resultsNewFile.addEventListener("click", goHome);
  els.errorNewFile.addEventListener("click", goHome);
}

async function convertFixtureBytes(sourceName = "GB_Ob_213_33_22-23_test_v2.mei") {
  const response = await fetch("./fixtures/o-felix-basic.mei");
  const buffer = await response.arrayBuffer();
  const file = new File([buffer], sourceName, { type: "application/xml" });
  await readPendingFile(file);
  return convertPending();
}

try {
  bindUi();
  setAppState(AppState.HOME);
  setStatus("Ready");
  whenViewerReady().then(() => {
    if (app.state === AppState.HOME) setStatus("Ready");
  });
} catch (error) {
  console.error(error);
  setStatus("Application failed to start.", true);
}

const api = {
  AppState,
  classifyMei,
  convertFixture: convertFixtureBytes,
  viewConverted,
  goHome,
  async stageFixture(path, name) {
    const response = await fetch(path);
    const buffer = await response.arrayBuffer();
    const file = new File([buffer], name || path.split("/").pop(), {
      type: "application/xml",
    });
    await readPendingFile(file);
    return {
      kind: app.pendingFile.kind,
      pendingKind: els.pendingKind.textContent,
      hint: els.pendingHint.textContent,
      convertLabel: els.convertBasic.textContent,
      viewLabel: els.viewExisting.textContent,
      convertPrimary: els.convertBasic.classList.contains("primary"),
      viewPrimary: els.viewExisting.classList.contains("primary"),
    };
  },
  async convertInvalid() {
    try {
      await ensureConverterReady();
      setAppState(AppState.CONVERTING_BASIC);
      await client.convert(new TextEncoder().encode("<not-mei/>").buffer, "bad.mei");
      throw new Error("invalid payload unexpectedly succeeded");
    } catch (error) {
      showError(error);
      return error;
    }
  },
  async openFixture(path, name) {
    const response = await fetch(path);
    const buffer = await response.arrayBuffer();
    const file = new File([buffer], name || path.split("/").pop(), {
      type: "application/xml",
    });
    await readPendingFile(file);
    await viewExistingFromPending();
  },
  getState: () => ({
    appState: app.state,
    conversionCount: app.conversionCount,
    pendingKind: app.pendingFile && app.pendingFile.kind,
    pendingLabel: els.pendingKind.textContent,
    convertLabel: els.convertBasic.textContent,
    viewLabel: els.viewExisting.textContent,
    convertPrimary: els.convertBasic.classList.contains("primary"),
    viewPrimary: els.viewExisting.classList.contains("primary"),
    workerCreated: client.hasWorker(),
    pyodideInitialized: app.pyodideInitialized,
    pyodideResourceCount: pyodideResourceCount(),
    conversion: app.currentConversion && {
      sourceName: app.currentConversion.sourceName,
      cmnSize: app.currentConversion.cmnBytes.byteLength,
      mensuralSize: app.currentConversion.mensuralBytes.byteLength,
      cmnSha: app.currentConversion.cmnSha,
      mensuralSha: app.currentConversion.mensuralSha,
      cmnFilename: app.currentConversion.cmnFilename,
      mensuralFilename: app.currentConversion.mensuralFilename,
      diagnostics: app.currentConversion.diagnostics,
      warningCount: app.currentConversion.metadata.warning_count,
      conversionMs: app.currentConversion.conversionMs,
      expectedCmn: app.currentConversion.cmnSha === EXPECTED_CMN_SHA,
      expectedMensural: app.currentConversion.mensuralSha === EXPECTED_MENSURAL_SHA,
    },
    viewer: window.__ciconiaViewer ? window.__ciconiaViewer.getState() : null,
    timings: app.timings,
    lastError: app.lastError && {
      name: app.lastError.name,
      message: app.lastError.message,
    },
  }),
};
window.__ciconiaWeb = api;
