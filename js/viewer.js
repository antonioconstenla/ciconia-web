(() => {
  const BASE_SCALE = 40;
  const DEFAULT_ZOOM_PERCENT = 100;
  const MIN_ZOOM_PERCENT = 50;
  const MAX_ZOOM_PERCENT = 250;
  const ZOOM_STEP_PERCENT = 10;

  const els = {
    open: document.getElementById("open-mei"),
    filename: document.getElementById("filename"),
    prev: document.getElementById("prev"),
    next: document.getElementById("next"),
    pageLabel: document.getElementById("page-label"),
    zoomOut: document.getElementById("zoom-out"),
    zoomIn: document.getElementById("zoom-in"),
    zoomReset: document.getElementById("zoom-reset"),
    zoomLabel: document.getElementById("zoom-label"),
    saveSvg: document.getElementById("save-svg"),
    printPdf: document.getElementById("print-pdf"),
    previewControls: document.getElementById("preview-controls"),
    previewLyrics: document.getElementById("preview-lyrics"),
    previewSourceSystems: document.getElementById("preview-source-systems"),
    status: document.getElementById("status"),
    score: document.getElementById("score"),
    provenance: document.getElementById("provenance"),
  };

  const state = {
    toolkit: null,
    page: 1,
    pageCount: 0,
    zoomPercent: DEFAULT_ZOOM_PERCENT,
    filename: "",
    meiText: "",
    isMensural: false,
    svg: "",
    renderingOptions: {},
    previewOptions: {
      showLyrics: true,
      respectSourceSystems: true,
    },
  };

  function setStatus(text, isError) {
    els.status.textContent = text;
    els.status.classList.toggle("error", Boolean(isError));
  }

  function waitModule(mod) {
    if (!mod) return Promise.reject(new Error("Ciconia toolkit module is missing"));
    if (mod.HEAPU8 && typeof mod._vrvToolkit_constructor === "function") {
      return Promise.resolve(mod);
    }
    if (mod.calledRun) return Promise.resolve(mod);
    if (mod.ready && typeof mod.ready.then === "function") return mod.ready.then(() => mod);
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => {
        if (mod.HEAPU8 && typeof mod._vrvToolkit_constructor === "function") {
          resolve(mod);
          return;
        }
        reject(new Error("Timed out waiting for Ciconia WASM"));
      }, 120000);
      const prev = mod.onRuntimeInitialized;
      mod.onRuntimeInitialized = () => {
        clearTimeout(t);
        if (typeof prev === "function") prev();
        resolve(mod);
      };
    });
  }

  function toRenderScale(zoomPercent) {
    return Math.round((BASE_SCALE * zoomPercent) / 100);
  }

  function detectMensuralNotation(meiText) {
    try {
      const doc = new DOMParser().parseFromString(meiText, "application/xml");
      if (doc.querySelector("parsererror")) return false;
      const staffDefs = Array.from(doc.getElementsByTagName("staffDef"));
      return staffDefs.some((node) => {
        const notationType = (node.getAttribute("notationtype") || "").toLowerCase();
        return notationType.startsWith("mensural");
      });
    } catch (_err) {
      return false;
    }
  }

  function defaultPreviewOptions() {
    return {
      showLyrics: true,
      respectSourceSystems: true,
    };
  }

  function buildRenderOptions(zoomPercent, isMensural, previewOptions) {
    const preview = previewOptions || state.previewOptions;
    const respectSourceSystems = preview.respectSourceSystems !== false;
    const showLyrics = preview.showLyrics !== false;
    const options = {
      mdivAll: true,
      scale: toRenderScale(zoomPercent),
      svgViewBox: true,
      evenNoteSpacing: Boolean(isMensural),
      mmOutput: false,
      showLyrics,
      breaks: respectSourceSystems ? "encoded" : "auto",
      adjustPageHeight: Boolean(isMensural && respectSourceSystems),
    };
    return options;
  }

  function applyPreviewRerender() {
    if (!state.toolkit || !state.meiText) return;
    state.renderingOptions = buildRenderOptions(
      state.zoomPercent,
      state.isMensural,
      state.previewOptions
    );
    applyOptions(state.renderingOptions);
    state.toolkit.redoLayout();
    state.pageCount = state.toolkit.getPageCount();
    if (state.pageCount < 1) throw new Error("Ciconia reported 0 pages after preview rerender");
    if (state.page > state.pageCount) state.page = state.pageCount;
    state.svg = state.toolkit.renderToSVG(state.page);
    els.score.innerHTML = state.svg;
    const svgEl = els.score.querySelector("svg");
    if (!svgEl) throw new Error("Ciconia did not insert an SVG page");
    applySvgIntrinsicSize(svgEl);
    const preview = getPreviewOptions();
    const parts = [
      `Rendered ${state.filename} — page ${state.page} / ${state.pageCount} — zoom ${state.zoomPercent}%`,
    ];
    if (state.isMensural) {
      parts.push(preview.showLyrics ? "lyrics on" : "lyrics off");
      parts.push(
        preview.respectSourceSystems ? "source systems on" : "source systems off"
      );
    }
    setStatus(parts.join(" — "));
    updateControls();
  }

  function setPreviewOptions(partial) {
    state.previewOptions = {
      ...state.previewOptions,
      ...(partial || {}),
    };
    if (els.previewLyrics) els.previewLyrics.checked = state.previewOptions.showLyrics !== false;
    if (els.previewSourceSystems) {
      els.previewSourceSystems.checked = state.previewOptions.respectSourceSystems !== false;
    }
    applyPreviewRerender();
    return getPreviewOptions();
  }

  function getPreviewOptions() {
    return {
      showLyrics: state.previewOptions.showLyrics !== false,
      respectSourceSystems: state.previewOptions.respectSourceSystems !== false,
    };
  }

  function syncPreviewControlsFromState() {
    if (els.previewLyrics) els.previewLyrics.checked = state.previewOptions.showLyrics !== false;
    if (els.previewSourceSystems) {
      els.previewSourceSystems.checked = state.previewOptions.respectSourceSystems !== false;
    }
  }

  function svgMetrics() {
    const svgEl = els.score.querySelector("svg");
    if (!svgEl) return null;
    return {
      viewBox: svgEl.getAttribute("viewBox"),
      widthAttr: svgEl.getAttribute("width"),
      heightAttr: svgEl.getAttribute("height"),
      clientWidth: svgEl.clientWidth,
      clientHeight: svgEl.clientHeight,
      zoomPercent: state.zoomPercent,
      scale: toRenderScale(state.zoomPercent),
      mmOutput: state.renderingOptions.mmOutput === true,
    };
  }

  function restoreScreenView() {
    if (!state.toolkit || !state.meiText) return;
    state.renderingOptions = buildRenderOptions(
      state.zoomPercent,
      state.isMensural,
      state.previewOptions
    );
    applyOptions(state.renderingOptions);
    state.toolkit.redoLayout();
    state.pageCount = state.toolkit.getPageCount();
    if (state.pageCount < 1) throw new Error("Ciconia reported 0 pages after print restore");
    if (state.page > state.pageCount) state.page = state.pageCount;
    renderPage();
  }

  function applyOptions(options) {
    state.toolkit.setOptions(options);
  }

  function updateControls() {
    const loaded = state.pageCount > 0;
    const mensuralPreview = loaded && state.isMensural;
    els.prev.disabled = !loaded || state.page <= 1;
    els.next.disabled = !loaded || state.page >= state.pageCount;
    els.zoomOut.disabled = !loaded || state.zoomPercent <= MIN_ZOOM_PERCENT;
    els.zoomIn.disabled = !loaded || state.zoomPercent >= MAX_ZOOM_PERCENT;
    els.zoomReset.disabled = !loaded;
    els.saveSvg.disabled = !loaded || !state.svg;
    els.printPdf.disabled = !loaded || !state.meiText;
    if (els.previewControls) els.previewControls.disabled = !mensuralPreview;
    if (els.previewLyrics) els.previewLyrics.disabled = !mensuralPreview;
    if (els.previewSourceSystems) els.previewSourceSystems.disabled = !mensuralPreview;
    els.pageLabel.textContent = loaded
      ? `Page ${state.page} / ${state.pageCount}`
      : "Page — / —";
    els.zoomLabel.textContent = loaded ? `Zoom ${state.zoomPercent}%` : "Zoom —%";
  }

  function applySvgIntrinsicSize(svgEl) {
    const vb = svgEl.getAttribute("viewBox");
    if (!vb) return;
    const parts = vb.split(/[\s,]+/).map(Number);
    if (parts.length >= 4 && parts[2] > 0 && parts[3] > 0) {
      svgEl.setAttribute("width", parts[2]);
      svgEl.setAttribute("height", parts[3]);
      svgEl.style.maxWidth = "none";
    }
  }

  function renderPage() {
    if (!state.toolkit || state.pageCount < 1) return;
    state.renderingOptions = buildRenderOptions(
      state.zoomPercent,
      state.isMensural,
      state.previewOptions
    );
    applyOptions(state.renderingOptions);
    state.toolkit.redoLayout();
    state.svg = state.toolkit.renderToSVG(state.page);
    els.score.innerHTML = state.svg;
    const svgEl = els.score.querySelector("svg");
    if (!svgEl) throw new Error("Ciconia did not insert an SVG page");
    applySvgIntrinsicSize(svgEl);
    const preview = getPreviewOptions();
    const parts = [
      `Rendered ${state.filename} — page ${state.page} / ${state.pageCount} — zoom ${state.zoomPercent}%`,
    ];
    if (state.isMensural) {
      parts.push(preview.showLyrics ? "lyrics on" : "lyrics off");
      parts.push(
        preview.respectSourceSystems ? "source systems on" : "source systems off"
      );
    }
    setStatus(parts.join(" — "));
    updateControls();
  }

  function loadMei(text, filename) {
    state.filename = filename || "untitled.mei";
    state.meiText = text;
    state.isMensural = detectMensuralNotation(text);
    state.previewOptions = defaultPreviewOptions();
    syncPreviewControlsFromState();
    els.filename.textContent = state.filename;
    state.page = 1;
    state.zoomPercent = DEFAULT_ZOOM_PERCENT;
    state.renderingOptions = buildRenderOptions(
      state.zoomPercent,
      state.isMensural,
      state.previewOptions
    );
    applyOptions(state.renderingOptions);
    if (!state.toolkit.loadData(text)) {
      throw new Error("Ciconia loadData failed");
    }
    state.toolkit.redoLayout();
    state.pageCount = state.toolkit.getPageCount();
    if (!state.pageCount) throw new Error("Ciconia reported 0 pages");
    renderPage();
  }

  function buildSvgFilename() {
    const stem = (state.filename || "score").replace(/\.(mei|xml)$/i, "");
    return `${stem}-page-${String(state.page).padStart(3, "0")}.svg`;
  }

  function getPrintContainer() {
    let el = document.getElementById("print-container");
    if (!el) {
      el = document.createElement("div");
      el.id = "print-container";
      el.className = "print-container";
      document.body.appendChild(el);
    }
    return el;
  }

  function printInDocument(svgPages) {
    const container = getPrintContainer();
    container.innerHTML = svgPages
      .map(
        (svg, i) =>
          `<section class="print-page"><div class="print-meta">Page ${i + 1} / ${svgPages.length}</div>${svg}</section>`
      )
      .join("\n");
    document.body.classList.add("printing");
    const cleanup = () => {
      document.body.classList.remove("printing");
      container.innerHTML = "";
      restoreScreenView();
    };
    window.addEventListener("afterprint", cleanup, { once: true });
    window.print();
  }

  function buildPrintPages() {
    const previousPage = state.page;
    const printOptions = {
      ...buildRenderOptions(state.zoomPercent, state.isMensural, state.previewOptions),
      mmOutput: true,
    };
    const pages = [];
    try {
      applyOptions(printOptions);
      state.toolkit.redoLayout();
      const printPageCount = state.toolkit.getPageCount();
      for (let page = 1; page <= printPageCount; page += 1) {
        const svg = state.toolkit.renderToSVG(page);
        if (!svg || !svg.includes("<svg")) {
          throw new Error(`Print preparation failed at page ${page}`);
        }
        pages.push(svg);
      }
      return pages;
    } finally {
      state.page = previousPage;
      restoreScreenView();
    }
  }

  async function loadProvenance() {
    const res = await fetch("vendor/ciconia/BUILD_INFO.json");
    if (!res.ok) throw new Error("BUILD_INFO.json is missing; run scripts/sync-ciconia-toolkit.bat");
    const info = await res.json();
    const sha =
      (info.artifacts &&
        info.artifacts["verovio-toolkit-wasm.js"] &&
        info.artifacts["verovio-toolkit-wasm.js"].sha256) ||
      "";
    els.provenance.textContent = [
      `Ciconia ${info.ciconia_provisional_version}`,
      `core: ${String(info.ciconia_core_sha).slice(0, 8)}`,
      `upstream: ${String(info.upstream_base).slice(0, 8)}`,
      `Emscripten ${info.emscripten_version}`,
      `toolkit SHA ${sha.slice(0, 12)}`,
      info.status,
    ].join(" · ");
    return info;
  }

  function bind() {
    els.prev.addEventListener("click", () => {
      if (state.page > 1) {
        state.page -= 1;
        renderPage();
      }
    });
    els.next.addEventListener("click", () => {
      if (state.page < state.pageCount) {
        state.page += 1;
        renderPage();
      }
    });
    els.zoomOut.addEventListener("click", () => {
      state.zoomPercent = Math.max(
        MIN_ZOOM_PERCENT,
        state.zoomPercent - ZOOM_STEP_PERCENT
      );
      renderPage();
    });
    els.zoomIn.addEventListener("click", () => {
      state.zoomPercent = Math.min(
        MAX_ZOOM_PERCENT,
        state.zoomPercent + ZOOM_STEP_PERCENT
      );
      renderPage();
    });
    els.zoomReset.addEventListener("click", () => {
      state.zoomPercent = DEFAULT_ZOOM_PERCENT;
      renderPage();
    });
    els.saveSvg.addEventListener("click", () => {
      const blob = new Blob([state.svg], { type: "image/svg+xml" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = buildSvgFilename();
      a.click();
      URL.revokeObjectURL(url);
    });
    els.printPdf.addEventListener("click", () => {
      try {
        const pages = buildPrintPages();
        printInDocument(pages);
        setStatus(
          `Print/PDF prepared for ${pages.length} pages — use browser dialog to Save as PDF.`
        );
      } catch (err) {
        setStatus(String(err && err.message ? err.message : err), true);
      }
    });
    if (els.previewLyrics) {
      els.previewLyrics.addEventListener("change", () => {
        setPreviewOptions({ showLyrics: els.previewLyrics.checked });
      });
    }
    if (els.previewSourceSystems) {
      els.previewSourceSystems.addEventListener("change", () => {
        setPreviewOptions({ respectSourceSystems: els.previewSourceSystems.checked });
      });
    }
  }

  async function start() {
    try {
      if (typeof verovio === "undefined") {
        throw new Error("Ciconia toolkit script did not load (expected local vendor/ciconia, not verovio.org)");
      }
      await loadProvenance();
      await waitModule(verovio.module);
      state.toolkit = new verovio.toolkit();
      bind();
      updateControls();
      setStatus(`Ciconia toolkit ready (${state.toolkit.getVersion()}).`);
      window.__ciconiaViewer = {
        loadMei,
        loadMeiBytes(bytes, filename) {
          const text = new TextDecoder("utf-8").decode(bytes);
          loadMei(text, filename);
        },
        nextPage: () => {
          if (state.page < state.pageCount) {
            state.page += 1;
            renderPage();
          }
        },
        prevPage: () => {
          if (state.page > 1) {
            state.page -= 1;
            renderPage();
          }
        },
        zoomIn: () => {
          state.zoomPercent = Math.min(
            MAX_ZOOM_PERCENT,
            state.zoomPercent + ZOOM_STEP_PERCENT
          );
          renderPage();
        },
        zoomOut: () => {
          state.zoomPercent = Math.max(
            MIN_ZOOM_PERCENT,
            state.zoomPercent - ZOOM_STEP_PERCENT
          );
          renderPage();
        },
        zoomReset: () => {
          state.zoomPercent = DEFAULT_ZOOM_PERCENT;
          renderPage();
        },
        preparePrintPages: () => {
          const before = svgMetrics();
          const pages = buildPrintPages();
          const after = svgMetrics();
          const container = getPrintContainer();
          container.innerHTML = pages.map(
            (svg, i) =>
              `<section class="print-page"><div class="print-meta">Page ${i + 1} / ${pages.length}</div>${svg}</section>`
          ).join("\n");
          return {
            count: pages.length,
            containerChildCount: container.children.length,
            before,
            after,
          };
        },
        simulatePrintCycle() {
          const before = svgMetrics();
          const pages = buildPrintPages();
          const after = svgMetrics();
          return { before, after, pageCount: pages.length };
        },
        getSvgMetrics: svgMetrics,
        setPreviewOptions,
        getPreviewOptions,
        getState: () => ({
          version: state.toolkit.getVersion(),
          page: state.page,
          pageCount: state.pageCount,
          hasSvg: Boolean(els.score.querySelector("svg")),
          filename: state.filename,
          isMensural: state.isMensural,
          zoomPercent: state.zoomPercent,
          renderingOptions: state.renderingOptions,
          previewOptions: getPreviewOptions(),
          svg: svgMetrics(),
        }),
      };
      window.dispatchEvent(new Event("ciconia-ready"));
    } catch (err) {
      setStatus(String(err && err.message ? err.message : err), true);
    }
  }

  start();
})();
