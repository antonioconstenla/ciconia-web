# Ciconia Web

Browser application for viewing MEI scores with **Ciconia** (a Verovio-based mensural renderer) and converting MuseScore MEI Basic to CMN and mensural MEI entirely in the browser.

## What it does

- Open an existing MEI file and paginate, zoom, export SVG, and print/PDF.
- Convert MuseScore MEI Basic locally via Pyodide + a vendored mei-scribe wheel (no upload to a Ciconia server).
- Preview controls for mensural scores: Paroles (lyrics) and respect for encoded source systems.
- Downloads keep the converted MEI bytes immutable under preview option changes.

## Privacy

- Score files stay in the browser.
- Conversion runs locally in a Web Worker with Pyodide.
- The only required third-party network dependency for conversion is the pinned Pyodide CDN runtime (`314.0.3`).
- The Ciconia toolkit and mei-scribe wheel are served same-origin with the application.

## Run locally

From this directory:

```bat
python scripts/serve-v02.py
```

Then open `http://127.0.0.1:8771/` (or, for project-Pages-like testing, `python scripts/serve-publication-subpath.py` and open `http://127.0.0.1:8788/ciconia-web/`).

The local server sets JavaScript MIME types for `.mjs` modules.

## Provenance

Public release packaging identity: **Ciconia Web v0.3** (publication-sanitized toolkit rebuild from Ciconia core `04a0be7`).

See `vendor/ciconia/BUILD_INFO.json` and `vendor/mei-scribe/WHEEL_PROVENANCE.txt` for artifact hashes and pins.

## Current limitations

- Layout profiles, facsimile/IIIF, and self-hosted Pyodide distribution are not part of this release.
- This package is intended for static hosting (for example GitHub Pages) from the frozen publication tree.
