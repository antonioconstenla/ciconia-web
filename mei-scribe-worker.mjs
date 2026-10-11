const PYODIDE_VERSION = "314.0.3";
const PYODIDE_INDEX_URL = `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/`;
const PYODIDE_MJS_URL = `${PYODIDE_INDEX_URL}pyodide.mjs`;
const WHEEL_NAME = "mei_scribe-0.0.1-py3-none-any.whl";
const WHEEL_SHA256 = "06919386619211f437174b480efae745ace017482664892c5926575688639b46";
const WHEEL_URL = new URL(
  `./vendor/mei-scribe/${WHEEL_NAME}?v=${WHEEL_SHA256.slice(0, 12)}`,
  self.location.href
).href;

let pyodide = null;
let runtimeInfo = null;
let state = "UNINITIALIZED";
let initTimings = null;

function setState(next) {
  state = next;
}

function postResponse(id, payload, transfer = []) {
  self.postMessage({ id, ok: true, ...payload }, transfer);
}

function postError(id, error) {
  self.postMessage({
    id,
    ok: false,
    state,
    error: {
      name: error?.name ?? "Error",
      message: error?.message ?? String(error),
      stack: error?.stack ?? null,
    },
  });
}

function convertPythonResult(proxy) {
  try {
    return proxy.toJs({ dict_converter: Object.fromEntries });
  } finally {
    proxy.destroy();
  }
}

function resourceCount() {
  return performance.getEntriesByType("resource").length;
}

async function ensureReady() {
  if (pyodide) {
    return { initTimings, runtimeInfo };
  }

  const t0 = performance.now();
  setState("LOADING");
  const pyodideModule = await import(PYODIDE_MJS_URL);
  pyodide = await pyodideModule.loadPyodide({
    indexURL: PYODIDE_INDEX_URL,
  });
  const t1 = performance.now();

  await pyodide.loadPackage("micropip");
  const micropip = pyodide.pyimport("micropip");
  try {
    await micropip.install(WHEEL_URL);
  } finally {
    micropip.destroy();
  }

  const infoProxy = await pyodide.runPythonAsync(
    `
import mei_scribe
from mei_scribe.api import convert_mei_bytes

{
    "mei_scribe_version": mei_scribe.__version__,
    "convert_import_ok": callable(convert_mei_bytes),
}
`.trim()
  );
  runtimeInfo = convertPythonResult(infoProxy);

  const t2 = performance.now();
  initTimings = {
    pyodideLoadMs: t1 - t0,
    wheelInstallImportMs: t2 - t1,
    totalReadyMs: t2 - t0,
  };
  setState("READY");
  return { initTimings, runtimeInfo };
}

async function convertBytes(sourceBuffer, sourceName) {
  if (!pyodide) {
    throw new Error("worker not initialized");
  }
  setState("CONVERTING");
  const beforeResources = resourceCount();
  const sourceBytes = Array.from(new Uint8Array(sourceBuffer));
  pyodide.globals.set("SOURCE_LIST", sourceBytes);
  pyodide.globals.set("SOURCE_NAME", sourceName);
  const t0 = performance.now();
  try {
    const resultProxy = await pyodide.runPythonAsync(
      `
from mei_scribe.api import convert_mei_bytes

result = convert_mei_bytes(bytes(SOURCE_LIST), source_name=SOURCE_NAME)

{
    "cmn_bytes": list(result.cmn_mei),
    "mensural_bytes": list(result.mensural_mei),
    "diagnostics": [
        {
            "severity": item.severity,
            "code": item.code,
            "feature": item.feature,
            "message": item.message,
            "voice_identity": item.voice_identity,
            "measure_n": item.measure_n,
            "ordinal": item.ordinal,
            "source_text": item.source_text,
            "source_xml_id": item.source_xml_id,
        }
        for item in result.diagnostics
    ],
    "metadata": {
        "source_name": result.metadata.source_name,
        "diagnostic_count": result.metadata.diagnostic_count,
        "warning_count": result.metadata.warning_count,
        "suggested_output_names": None
        if result.metadata.suggested_output_names is None
        else {
            "cmn_name": result.metadata.suggested_output_names.cmn_name,
            "mensural_name": result.metadata.suggested_output_names.mensural_name,
        },
    },
}
`.trim()
    );
    const converted = convertPythonResult(resultProxy);
    const t1 = performance.now();
    const cmnBytes = new Uint8Array(converted.cmn_bytes);
    const mensuralBytes = new Uint8Array(converted.mensural_bytes);
    setState("READY");
    return {
      state,
      cmnBytes,
      mensuralBytes,
      diagnostics: converted.diagnostics,
      metadata: converted.metadata,
      conversionMs: t1 - t0,
      resourceCountBefore: beforeResources,
      resourceCountAfter: resourceCount(),
    };
  } finally {
    pyodide.globals.delete("SOURCE_LIST");
    pyodide.globals.delete("SOURCE_NAME");
    if (state !== "ERROR") {
      setState("READY");
    }
  }
}

self.onmessage = async (event) => {
  const { id, type, payload } = event.data;
  try {
    if (type === "initialize") {
      const ready = await ensureReady();
      postResponse(id, { state, ...ready });
      return;
    }
    if (type === "convert") {
      const converted = await convertBytes(payload.sourceBuffer, payload.sourceName);
      postResponse(id, converted);
      return;
    }
    if (type === "runtime") {
      postResponse(id, { state, initTimings, runtimeInfo });
      return;
    }
    throw new Error(`unsupported worker message type: ${type}`);
  } catch (error) {
    setState("ERROR");
    postError(id, error);
    if (pyodide) {
      setState("READY");
    } else {
      setState("UNINITIALIZED");
    }
  }
};
