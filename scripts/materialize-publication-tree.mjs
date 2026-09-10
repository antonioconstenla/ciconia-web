#!/usr/bin/env node
/**
 * Materialize the intended publication Git tree or Pages artifact without staging/commit.
 * Proves completeness from publication-intent content only (Harness-safe).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

function arg(name, fallback = null) {
  const i = process.argv.indexOf(name);
  if (i === -1) return fallback;
  return process.argv[i + 1];
}

const mode = arg("--mode", "git-tree"); // git-tree | pages-artifact | git-tree-omit-toolkit
const outDir = path.resolve(arg("--out", path.join(root, "_publication_materialization")));

const REQUIRED_RUNTIME = [
  "vendor/ciconia/verovio-toolkit-wasm.js",
  "vendor/ciconia/verovio.js",
];

const ALWAYS_EXCLUDE_PREFIXES = [".cursor/", "node_modules/", "_site/", "_publication_materialization/"];

function listTracked() {
  const r = spawnSync("git", ["-C", root, "ls-files", "-z"], { encoding: "buffer" });
  if (r.status !== 0) throw new Error("git ls-files failed");
  return r.stdout
    .toString("utf8")
    .split("\0")
    .filter(Boolean);
}

function shouldCopy(rel, modeName) {
  const norm = rel.replace(/\\/g, "/");
  if (ALWAYS_EXCLUDE_PREFIXES.some((p) => norm === p.slice(0, -1) || norm.startsWith(p))) {
    return false;
  }
  if (modeName === "pages-artifact") {
    if (norm.startsWith(".github/")) return false;
    if (norm.startsWith("scripts/")) return false;
    if (norm === ".gitignore" || norm === ".gitattributes") return false;
    if (norm === "README.md") return true;
  }
  return true;
}

function copyFile(rel) {
  const src = path.join(root, rel);
  const dst = path.join(outDir, rel);
  if (!fs.existsSync(src)) throw new Error(`missing source: ${rel}`);
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.copyFileSync(src, dst);
}

fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

const tracked = listTracked();
const extras = [
  ".github/workflows/pages.yml",
  ...REQUIRED_RUNTIME,
];

const intended = new Set();
for (const rel of tracked) {
  if (shouldCopy(rel, mode)) intended.add(rel.replace(/\\/g, "/"));
}
for (const rel of extras) {
  if (mode === "git-tree-omit-toolkit" && REQUIRED_RUNTIME.includes(rel)) continue;
  if (shouldCopy(rel, mode)) intended.add(rel);
}
// Always include modified .gitignore from working tree for git-tree modes
if (mode.startsWith("git-tree")) {
  intended.add(".gitignore");
}

const copied = [];
for (const rel of [...intended].sort()) {
  // Prefer working-tree file (includes packaging edits)
  const src = path.join(root, rel);
  if (!fs.existsSync(src)) {
    if (REQUIRED_RUNTIME.includes(rel) && mode !== "git-tree-omit-toolkit") {
      throw new Error(`required runtime missing in worktree: ${rel}`);
    }
    continue;
  }
  copyFile(rel);
  copied.push(rel);
}

const inventory = {
  mode,
  outDir,
  count: copied.length,
  hasToolkitWasm: copied.includes("vendor/ciconia/verovio-toolkit-wasm.js"),
  hasToolkitJs: copied.includes("vendor/ciconia/verovio.js"),
  hasWheel: copied.includes("vendor/mei-scribe/mei_scribe-0.0.1-py3-none-any.whl"),
  hasIndex: copied.includes("index.html"),
  hasWorkflow: copied.includes(".github/workflows/pages.yml"),
  paths: copied,
};

fs.writeFileSync(path.join(outDir, "_INVENTORY.json"), JSON.stringify(inventory, null, 2));
console.log(JSON.stringify({ ok: true, ...inventory, paths: undefined, pathCount: copied.length }, null, 2));
