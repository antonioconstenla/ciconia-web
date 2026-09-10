# Sync Ciconia toolkit artifacts into vendor/ciconia.
# Override with env CICONIA_WASM_BUILD if the build output is elsewhere.
$src = if ($env:CICONIA_WASM_BUILD) {
  $env:CICONIA_WASM_BUILD
} else {
  Join-Path (Split-Path (Split-Path $PSScriptRoot -Parent) -Parent) "ciconia-verovio\emscripten\build"
}
$dest = Join-Path (Split-Path $PSScriptRoot -Parent) "vendor\ciconia"
if (-not (Test-Path "$src\verovio-toolkit-wasm.js")) {
  throw "Missing Ciconia WASM build at $src (set CICONIA_WASM_BUILD to override)"
}
New-Item -ItemType Directory -Force -Path $dest | Out-Null
Copy-Item -Force "$src\verovio-toolkit-wasm.js" "$dest\verovio-toolkit-wasm.js"
Copy-Item -Force "$src\verovio.js" "$dest\verovio.js"
if (Test-Path "$src\verovio-toolkit-wasm.js.gz") {
  Copy-Item -Force "$src\verovio-toolkit-wasm.js.gz" "$dest\verovio-toolkit-wasm.js.gz"
}
if (Test-Path "$dest\BUILD_INFO.json") {
  Write-Host "Note: preserving existing BUILD_INFO.json; refresh separately if needed"
}
Write-Host "Synchronized Ciconia toolkit from $src"
Get-ChildItem $dest | ForEach-Object { "{0}`t{1}" -f $_.Name, $_.Length }
