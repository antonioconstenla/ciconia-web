/**
 * Browser automation helpers for v0.3 preview-control hard gates.
 * Loaded only by human/browser smoke; not part of production app.
 *
 * Usage in browser console after conversion:
 *   await window.__ciconiaV03Proof.runDownloadInvariance()
 */
(function () {
  async function sha256(bytes) {
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
  }

  async function runDownloadInvariance() {
    const web = window.__ciconiaWeb;
    const viewer = window.__ciconiaViewer;
    if (!web || !viewer) throw new Error("Ciconia web/viewer APIs missing");
    const before = web.getState();
    if (!before.conversion) throw new Error("No conversion result; convert first");
    const startCount = before.conversionCount;
    const cmn0 = before.conversion.cmnSha;
    const mens0 = before.conversion.mensuralSha;

    await web.viewMensural();
    const combos = [
      { showLyrics: true, respectSourceSystems: true },
      { showLyrics: false, respectSourceSystems: true },
      { showLyrics: true, respectSourceSystems: false },
      { showLyrics: false, respectSourceSystems: false },
    ];
    const observed = [];
    for (const combo of combos) {
      viewer.setPreviewOptions(combo);
      const st = web.getState();
      observed.push({
        combo,
        conversionCount: st.conversionCount,
        cmnSha: st.conversion.cmnSha,
        mensuralSha: st.conversion.mensuralSha,
        renderingOptions: st.viewer && st.viewer.renderingOptions,
        previewOptions: st.viewer && st.viewer.previewOptions,
        hasSyl: /class="syl"/i.test(document.getElementById("score").innerHTML),
        hasAnchored: /anchoredText/i.test(document.getElementById("score").innerHTML),
      });
    }
    const pass =
      observed.every((row) => row.conversionCount === startCount) &&
      observed.every((row) => row.cmnSha === cmn0 && row.mensuralSha === mens0);
    return { pass, startCount, cmn0, mens0, observed, sha256 };
  }

  window.__ciconiaV03Proof = { runDownloadInvariance, sha256 };
})();
