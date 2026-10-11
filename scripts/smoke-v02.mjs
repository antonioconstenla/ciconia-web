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
const client = read("js/mei-scribe-client.mjs");
const worker = read("mei-scribe-worker.mjs");
const html = read("index.html");

assert(!viewer.includes("pyodide"), "viewer.js must not mention Pyodide");
assert(!viewer.includes("cdn.jsdelivr.net"), "viewer.js must not load a CDN");
assert(viewer.includes("window.print()"), "viewer.js must keep window.print");
assert(!viewer.includes("window.open"), "viewer.js must not reopen popups");
assert(html.includes("js/app.mjs?v=069193866192"), "index.html must cache-bust app.mjs");
assert(client.includes("mei-scribe-worker.mjs?v=069193866192"), "client must cache-bust the worker URL");
assert(worker.includes("?v=${WHEEL_SHA256.slice(0, 12)}"), "worker must cache-bust the wheel URL");
assert(worker.includes("06919386619211f437174b480efae745ace017482664892c5926575688639b46"), "worker must pin wheel SHA");
assert(!html.includes("pyodide.mjs"), "index.html must not load Pyodide on the main page");
assert(worker.includes('PYODIDE_VERSION = "314.0.3"'), "worker must pin Pyodide 314.0.3");
assert(worker.includes("from mei_scribe.api import convert_mei_bytes"), "worker must use public API");
assert(client.includes("new Worker"), "client must create a Worker");
assert(client.includes("if (worker) return worker"), "Worker must be created lazily");
assert(app.includes("Preparing converter"), "UI must mention preparing converter");
assert(!app.includes("sys.platform"), "main UI code must not expose sys.platform");
assert(!app.includes("heartbeat"), "main UI must not expose heartbeat");

const wheel = path.join(root, "vendor", "mei-scribe", "mei_scribe-0.0.1-py3-none-any.whl");
assert(fs.existsSync(wheel), "local mei-scribe wheel is missing");
const wheelSha = createHash("sha256").update(fs.readFileSync(wheel)).digest("hex");

const fixture = fs.readFileSync(path.join(root, "fixtures", "o-felix-basic.mei"));
const cmn = fs.readFileSync(path.join(root, "fixtures", "o-felix.cmn.mei"));
const mensural = fs.readFileSync(path.join(root, "fixtures", "o-felix.mensural.mei"));
assert(
  createHash("sha256").update(cmn).digest("hex") ===
    "9a4ec3640502585701c8d071386683163aa7bf8cda093214e3ab292b51f540b0",
  "copied CMN fixture SHA mismatch"
);
assert(
  createHash("sha256").update(mensural).digest("hex") ===
    "5ee4e6b8cbccee7e28664846ad0b6397e8ec31dcfc71575f38c97b567ba09d61",
  "copied mensural fixture SHA mismatch"
);
assert(fixture.includes('meiversion="5.1+basic"'), "basic fixture is not MEI Basic");
assert(app.includes('version.includes("+basic")'), "UX classification must use explicit +basic");
assert(app.includes("MuseScore MEI Basic source"), "Basic source label missing");
assert(app.includes("View source (unconverted)"), "unconverted source-view label missing");
assert(html.includes(">Convert<"), "primary Convert action missing");
assert(
  app.includes("MuseScore .mscz files are not accepted. Export MEI Basic first."),
  "mscz rejection message changed"
);
assert(viewer.includes("mmOutput: false"), "screen options must disable mmOutput");
assert(viewer.includes("restoreScreenView"), "print must restore screen view");
assert(viewer.includes("simulatePrintCycle"), "print-cycle test hook missing");

console.log(
  JSON.stringify(
    {
      staticArchitecture: "PASS",
      lazyWorker: true,
      pyodidePinned: "314.0.3",
      wheelPresent: true,
      wheelSha,
      fixtureBytes: fixture.length,
      cmnBytes: cmn.length,
      mensuralBytes: mensural.length,
    },
    null,
    2
  )
);
