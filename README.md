# Ciconia Web

Ciconia Web lets you open MEI scores and convert MuseScore MEI Basic
files into CMN and mensural MEI directly in your browser.

## Use Ciconia Web

**Open Ciconia Web:**
https://antonioconstenla.github.io/ciconia-web/

No installation is required.

### Quick start

1. Open your transcription in MuseScore.
2. Export it from MuseScore as an MEI file.
3. Open Ciconia Web using the link above.
4. Drag the `.mei` file into the page, or click **Choose file**.
5. Click **Convert**.
6. Inspect the **CMN** and **Mensural** results and download the files you
   want to keep.

> Ciconia Web does not open `.mscz` files directly. Export your MuseScore
> score as MEI first.

## What you can do

- Open and view an existing MEI score.
- Convert MuseScore MEI Basic to CMN and mensural MEI.
- View both conversion results in the browser.
- Show or hide lyrics in the mensural preview.
- Respect or ignore encoded source systems in the preview.
- Zoom the score.
- Export SVG.
- Print or save as PDF.
- Download the generated CMN and mensural MEI files.

## Privacy

Your score is processed in your browser. It is not uploaded to a Ciconia
server.

Conversion runs locally in a Web Worker using Pyodide.

The only required third-party network dependency for conversion is the
pinned Pyodide CDN runtime (`314.0.3`). The Ciconia toolkit and mei-scribe
wheel are served with the application itself.

## For developers: run locally

From this directory:

```bat
python scripts/serve-v02.py
```

Then open `http://127.0.0.1:8771/` (or, for project-Pages-like testing,
`python scripts/serve-publication-subpath.py` and open
`http://127.0.0.1:8788/ciconia-web/`).

The local server sets JavaScript MIME types for `.mjs` modules.

## Provenance

Public release packaging identity: **Ciconia Web v0.3** (publication-sanitized
toolkit rebuild from Ciconia core `04a0be7`).

See `vendor/ciconia/BUILD_INFO.json` and
`vendor/mei-scribe/WHEEL_PROVENANCE.txt` for artifact hashes and pins.

## Current limitations

- Layout profiles, facsimile/IIIF, and self-hosted Pyodide distribution are
  not part of this release.
- This package is intended for static hosting (for example GitHub Pages)
  from the frozen publication tree.
