// JS interactions for image.html: upload, drag-drop, preview, zoom, reset
document.addEventListener('DOMContentLoaded', () => {
  const input = document.querySelector('#file-input');
  const img = document.querySelector('#image-preview');
  const placeholder = document.querySelector('.placeholder');
  const uploadArea = document.querySelector('#upload-area');
  const previewContainer = document.querySelector('#preview-container');
  const zoom = document.querySelector('#zoom');
  const zoomValue = document.querySelector('#zoom-value');
  const zoomInput = document.querySelector('#zoom-input');
  const zoomCanvas = document.querySelector('#zoom-canvas');
  const loadingOverlay = document.querySelector('#loading-overlay');
  const loadingText = document.querySelector('#loading-text');

  const resizeSection = document.querySelector('#resize-section');

  const resizeModeAuto = document.querySelector('#resize-mode-auto');
  const resizeModeManual = document.querySelector('#resize-mode-manual');
  const resizeAutoPanel = document.querySelector('#resize-auto');
  const resizeManualPanel = document.querySelector('#resize-manual');

  const resizeScale = document.querySelector('#resize-scale');
  const resizeScaleValue = document.querySelector('#resize-scale-value');
  const resizeWidth = document.querySelector('#resize-width');
  const resizeHeight = document.querySelector('#resize-height');
  const lockAspect = document.querySelector('#lock-aspect');

  const resetBtn = document.querySelector('#reset-btn');

  const cropStartBtn = document.querySelector('#crop-start');
  const cropApplyBtn = document.querySelector('#crop-apply');
  const cropCancelBtn = document.querySelector('#crop-cancel');
  const cropOverlay = document.querySelector('#crop-overlay');
  const cropRectEl = document.querySelector('#crop-rect');

  const cropModeManual = document.querySelector('#crop-mode-manual');
  const cropModeAuto = document.querySelector('#crop-mode-auto');
  const cropModeStraighten = document.querySelector('#crop-mode-straighten');
  const cropAutoPanel = document.querySelector('#crop-auto-panel');
  const cropSection = document.querySelector('#crop-section');
  const cropAspectGrid = document.querySelector('#crop-aspect-grid');
  const cropAspectTiles = Array.from(document.querySelectorAll('#crop-aspect-grid .aspect-tile'));

  const cropAspectWrap = document.querySelector('#crop-aspect-wrap');
  const cropPresetWrap = document.querySelector('#crop-preset-wrap');
  const cropPresetGrid = document.querySelector('#crop-preset-grid');
  const cropPresetTiles = Array.from(document.querySelectorAll('#crop-preset-grid .aspect-tile'));
  const cropAutoKindInputs = Array.from(document.querySelectorAll('[name="crop-auto-kind"]'));

  const straightenPanel = document.querySelector('#straighten-panel');
  const straightenInput = document.querySelector('#straighten');
  const straightenValueEl = document.querySelector('#straighten-value');
  const straightenApplyBtn = document.querySelector('#straighten-apply');

  let currentObjectUrl = null;
  let originalObjectUrl = null;
  let originalFile = null;
  let resampleBaseFile = null;

  let naturalWidth = 0;
  let naturalHeight = 0;
  let isSyncing = false;

  let baseDisplayWidth = 0;
  let baseDisplayHeight = 0;

  let currentZoomPercent = 100;
  let panX = 0;
  let panY = 0;
  let isPanning = false;
  let panStartClientX = 0;
  let panStartClientY = 0;
  let panStartX = 0;
  let panStartY = 0;

  let isCropping = false;
  let zoomBeforeCrop = 100;
  let isCropDragging = false;
  let cropMode = 'manual';
  let cropAutoKind = 'ratio'; // ratio | preset
  let cropAspectValue = '1:1';
  let cropPresetValue = '1080x1920';
  let isPresetPreviewing = false;
  let presetPreviewObjectUrl = null;
  let presetPreviewSnapshot = null;
  let cropStartX = 0;
  let cropStartY = 0;
  let cropX = 0;
  let cropY = 0;
  let cropW = 0;
  let cropH = 0;

  // Straighten uses an absolute slider value.
  // We track a committed base angle so the preview/apply uses only the delta.
  let straightenAngle = 0;
  let straightenBaseAngle = 0;

  const MAX_BYTES = 10 * 1024 * 1024;
  const debugMinLoadingMs = (() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const v = Number(params.get('debugLoadMs') || 0);
      return Number.isFinite(v) && v > 0 ? Math.min(30000, Math.max(0, v)) : 0;
    } catch {
      return 0;
    }
  })();

  let loadingStartedAt = 0;

  function setLoading(active, text = 'Memuat gambar...') {
    if (!loadingOverlay) return;
    if (loadingText) loadingText.textContent = String(text || 'Memuat gambar...');
    if (active) {
      loadingStartedAt = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    }
    loadingOverlay.hidden = !active;
    if (!active) loadingStartedAt = 0;
  }

  function hideLoading() {
    if (!loadingOverlay) return;
    if (!debugMinLoadingMs || !loadingStartedAt) {
      setLoading(false);
      return;
    }

    const now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    const elapsed = Math.max(0, now - loadingStartedAt);
    const remaining = Math.max(0, debugMinLoadingMs - elapsed);
    if (!remaining) {
      setLoading(false);
      return;
    }

    window.setTimeout(() => setLoading(false), Math.round(remaining));
  }

  function cleanupCurrentObjectUrl({ keepOriginal = false } = {}) {
    if (!currentObjectUrl) return;
    if (keepOriginal && currentObjectUrl === originalObjectUrl) return;
    URL.revokeObjectURL(currentObjectUrl);
    currentObjectUrl = null;
  }

  function cleanupAllObjectUrls() {
    if (currentObjectUrl) {
      URL.revokeObjectURL(currentObjectUrl);
    }
    if (originalObjectUrl && originalObjectUrl !== currentObjectUrl) {
      URL.revokeObjectURL(originalObjectUrl);
    }
    currentObjectUrl = null;
    originalObjectUrl = null;
    originalFile = null;
    resampleBaseFile = null;
  }

  function resetPreview() {
    cleanupAllObjectUrls();
    setLoading(false);
    if (presetPreviewObjectUrl) {
      try {
        URL.revokeObjectURL(presetPreviewObjectUrl);
      } catch {
        // ignore
      }
    }
    presetPreviewObjectUrl = null;
    presetPreviewSnapshot = null;
    isPresetPreviewing = false;
    if (img) {
      img.removeAttribute('src');
      img.style.display = 'none';
      img.style.transform = '';
      img.style.width = '';
      img.style.height = '';
      img.classList.remove('pixelated');
    }
    if (zoomCanvas) zoomCanvas.style.display = 'none';
    if (previewContainer) {
      previewContainer.classList.remove('pannable', 'dragging', 'cropping');
    }
    if (cropOverlay) cropOverlay.hidden = true;
    if (cropRectEl) {
      cropRectEl.style.left = '0px';
      cropRectEl.style.top = '0px';
      cropRectEl.style.width = '0px';
      cropRectEl.style.height = '0px';
    }
    if (cropStartBtn) {
      cropStartBtn.hidden = false;
      cropStartBtn.disabled = true;
    }
    cropAspectTiles.forEach((b) => (b.disabled = true));
    cropPresetTiles.forEach((b) => (b.disabled = true));
    if (cropApplyBtn) {
      cropApplyBtn.hidden = true;
      cropApplyBtn.disabled = true;
    }
    if (cropCancelBtn) cropCancelBtn.hidden = true;

    if (placeholder) placeholder.style.display = 'block';
    if (zoom) zoom.value = '100';
    if (zoomValue) zoomValue.textContent = '100%';
    if (zoomInput) zoomInput.value = '100';
    if (input) input.value = '';

    naturalWidth = 0;
    naturalHeight = 0;
    baseDisplayWidth = 0;
    baseDisplayHeight = 0;
    currentZoomPercent = 100;
    panX = 0;
    panY = 0;
    isCropping = false;
    zoomBeforeCrop = 100;
    isCropDragging = false;
    cropStartX = 0;
    cropStartY = 0;
    cropX = 0;
    cropY = 0;
    cropW = 0;
    cropH = 0;
    if (resizeScale) {
      resizeScale.value = '100';
      resizeScale.disabled = true;
    }
    if (resizeScaleValue) resizeScaleValue.textContent = '100%';
    if (resizeWidth) {
      resizeWidth.value = '';
      resizeWidth.disabled = true;
    }
    if (resizeHeight) {
      resizeHeight.value = '';
      resizeHeight.disabled = true;
    }
    if (resizeSection) resizeSection.hidden = true;

    // default mode
    if (resizeModeAuto) resizeModeAuto.checked = true;
    if (resizeAutoPanel) resizeAutoPanel.hidden = false;
    if (resizeManualPanel) resizeManualPanel.hidden = true;

    if (cropModeManual) cropModeManual.checked = true;
    cropMode = 'manual';
    cropAutoKind = 'ratio';
    cropPresetValue = '1080x1920';
    if (cropAutoPanel) cropAutoPanel.hidden = true;
    if (cropStartBtn) cropStartBtn.innerHTML = '<i class="fas fa-crop"></i> Crop';
    if (cropSection) cropSection.hidden = true;

    if (cropAutoKindInputs.length) {
      const ratio = cropAutoKindInputs.find((x) => x.value === 'ratio');
      if (ratio) ratio.checked = true;
    }
    if (cropAspectWrap) cropAspectWrap.hidden = false;
    if (cropPresetWrap) cropPresetWrap.hidden = true;

    if (straightenPanel) straightenPanel.hidden = true;
    if (straightenInput) {
      straightenInput.value = '0';
      straightenInput.disabled = true;
    }
    if (straightenValueEl) straightenValueEl.textContent = '0°';
    if (straightenApplyBtn) straightenApplyBtn.disabled = true;
    straightenAngle = 0;
    straightenBaseAngle = 0;
  }

  function normalizeDeg(deg) {
    const n = Number(deg);
    if (!Number.isFinite(n)) return 0;
    let d = ((n % 360) + 360) % 360;
    if (d > 180) d -= 360;
    return d;
  }

  function getStraightenDelta() {
    return normalizeDeg((Number(straightenAngle) || 0) - (Number(straightenBaseAngle) || 0));
  }

  function setImgTransform(scale) {
    const s = Number(scale) || 1;
    const a = getStraightenDelta();
    // Keep rotate + scale combined (order matters).
    img.style.transform = a ? `rotate(${a}deg) scale(${s})` : `scale(${s})`;
  }

  function resetEditsToOriginal() {
    const hasOriginal = Boolean(originalObjectUrl);
    if (!hasOriginal) {
      resetPreview();
      return;
    }


    if (isPresetPreviewing) {
      cancelPresetPreview({ restoreZoom: false });
    }

    if (isCropping) {
      cancelCrop({ restoreZoom: false });
    }

    // Revert to original uploaded source.
    if (img) {
      img.style.transform = '';
      img.style.width = '';
      img.style.height = '';
      img.style.display = 'block';
      img.classList.remove('pixelated');
    }
    if (zoomCanvas) zoomCanvas.style.display = 'none';
    if (previewContainer) {
      previewContainer.classList.remove('pannable', 'dragging', 'cropping');
    }
    if (placeholder) placeholder.style.display = 'none';

    // Reset zoom UI
    if (zoom) zoom.value = '100';
    if (zoomValue) zoomValue.textContent = '100%';
    if (zoomInput) zoomInput.value = '100';
    currentZoomPercent = 100;
    panX = 0;
    panY = 0;

    // Ensure future preset resizes always resample from the original.
    resampleBaseFile = originalFile;

    // Reset straighten preview
    straightenAngle = 0;
    straightenBaseAngle = 0;
    if (straightenInput) straightenInput.value = '0';
    if (straightenValueEl) straightenValueEl.textContent = '0°';

    // Reset resize UI to default mode and resync from the current fitted size.
    if (resizeModeAuto) resizeModeAuto.checked = true;
    setResizeMode('auto');

    // Switch back to original URL (and revoke derived URL if any).
    if (currentObjectUrl && currentObjectUrl !== originalObjectUrl) {
      try {
        URL.revokeObjectURL(currentObjectUrl);
      } catch {
        // ignore
      }
    }
    currentObjectUrl = originalObjectUrl;
    if (img && img.src !== originalObjectUrl) {
      img.src = originalObjectUrl;
    }

    // After clearing width/height and/or swapping src, resync controls.
    requestAnimationFrame(() => requestAnimationFrame(() => {
      syncControlsFromRenderedSize();
      if (img) img.style.transform = 'scale(1)';
    }));
  }

  function setCropUi(active) {
    if (!cropStartBtn || !cropApplyBtn || !cropCancelBtn || !cropOverlay) return;

    cropStartBtn.hidden = active;
    cropApplyBtn.hidden = !active;
    cropCancelBtn.hidden = !active;

    cropOverlay.hidden = !active;
    cropApplyBtn.disabled = true;

    // Keep zoom controls active during crop.
    if (resizeScale) resizeScale.disabled = active || !naturalWidth || !naturalHeight;
    if (resizeWidth) resizeWidth.disabled = active || !naturalWidth || !naturalHeight;
    if (resizeHeight) resizeHeight.disabled = active || !naturalWidth || !naturalHeight;

    if (previewContainer) {
      previewContainer.classList.toggle('cropping', active);
      previewContainer.classList.remove('dragging');
    }
  }

  function setCropMode(mode) {
    // Leaving preset preview context should revert to the real image.
    if (isPresetPreviewing && !(mode === 'auto' && cropAutoKind === 'preset')) {
      cancelPresetPreview({ restoreZoom: false });
    }
    cropMode = mode === 'auto' || mode === 'straighten' ? mode : 'manual';
    if (cropAutoPanel) cropAutoPanel.hidden = cropMode !== 'auto';
    if (straightenPanel) straightenPanel.hidden = cropMode !== 'straighten';
    cropAspectTiles.forEach((b) => (b.disabled = !(naturalWidth && naturalHeight)));
    cropPresetTiles.forEach((b) => (b.disabled = !(naturalWidth && naturalHeight)));

    if (cropMode === 'auto') updateCropAutoKindUI();

    if (cropStartBtn) {
      if (cropMode === 'straighten') {
        cropStartBtn.hidden = true;
      } else {
        cropStartBtn.hidden = false;
        cropStartBtn.innerHTML =
          cropMode === 'auto'
            ? (cropAutoKind === 'preset'
                ? '<i class="fas fa-check"></i> Terapkan'
                : '<i class="fas fa-wand-magic-sparkles"></i> Crop')
            : '<i class="fas fa-crop"></i> Crop';
      }
    }

    if (cropMode === 'straighten' && isCropping) {
      cancelCrop({ restoreZoom: false });
    }

    if (isCropping && cropMode === 'auto') {
      applyAutoAspectRect();
    }
  }

  function parseAspect(value) {
    const v = String(value || '').trim();
    const m = v.match(/^(\d+(?:\.\d+)?):(\d+(?:\.\d+)?)$/);
    if (!m) return null;
    const a = Number(m[1]);
    const b = Number(m[2]);
    if (!Number.isFinite(a) || !Number.isFinite(b) || a <= 0 || b <= 0) return null;
    return a / b;
  }

  function parsePreset(value) {
    const v = String(value || '').trim();
    const m = v.match(/^(\d+)\s*[xX×]\s*(\d+)$/);
    if (!m) return null;
    const w = Number(m[1]);
    const h = Number(m[2]);
    if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return null;
    return { w, h };
  }

  function getActiveAutoAspect() {
    if (cropAutoKind === 'preset') {
      const preset = parsePreset(cropPresetValue);
      if (preset) return preset.w / preset.h;
    }
    return parseAspect(cropAspectValue);
  }

  function updateCropAutoKindUI() {
    if (cropAspectWrap) cropAspectWrap.hidden = cropAutoKind !== 'ratio';
    if (cropPresetWrap) cropPresetWrap.hidden = cropAutoKind !== 'preset';

    if (isPresetPreviewing && cropAutoKind !== 'preset') {
      cancelPresetPreview({ restoreZoom: false });
    }

    if (cropStartBtn && cropMode === 'auto') {
      cropStartBtn.innerHTML =
        cropAutoKind === 'preset'
          ? '<i class="fas fa-check"></i> Terapkan'
          : '<i class="fas fa-wand-magic-sparkles"></i> Crop';
    }
  }

  function applyAutoAspectRect() {
    const bounds = getImageBoundsInContainer();
    if (!bounds) return;

    // Preset size is applied as output canvas size (like editgambar.html), not a crop rect.
    if (cropAutoKind === 'preset') return;

    const aspect = parseAspect(cropAspectValue);
    if (!aspect) return;

    // Max centered rect with requested aspect inside the image bounds.
    let w = bounds.width;
    let h = w / aspect;
    if (h > bounds.height) {
      h = bounds.height;
      w = h * aspect;
    }

    cropW = Math.max(1, w);
    cropH = Math.max(1, h);
    cropX = bounds.left + (bounds.width - cropW) / 2;
    cropY = bounds.top + (bounds.height - cropH) / 2;
    drawCropRect();

    if (cropApplyBtn) cropApplyBtn.disabled = !(cropW >= 4 && cropH >= 4);
  }

  function getImageBoundsInContainer() {
    if (!previewContainer || !img) return null;
    if (img.style.display === 'none') return null;

    const imgRect = img.getBoundingClientRect();
    const contRect = previewContainer.getBoundingClientRect();
    const left = imgRect.left - contRect.left;
    const top = imgRect.top - contRect.top;
    return {
      left,
      top,
      width: imgRect.width,
      height: imgRect.height,
      right: left + imgRect.width,
      bottom: top + imgRect.height,
    };
  }

  function drawCropRect() {
    if (!cropRectEl) return;
    cropRectEl.style.left = `${cropX}px`;
    cropRectEl.style.top = `${cropY}px`;
    cropRectEl.style.width = `${cropW}px`;
    cropRectEl.style.height = `${cropH}px`;
  }

  function beginCrop() {
    const hasImage = Boolean(naturalWidth && naturalHeight && currentObjectUrl);
    if (!hasImage) return;

    // Preset size should be previewed first; only commit when user clicks Terapkan.
    if (cropMode === 'auto' && cropAutoKind === 'preset') {
      applyPresetSize();
      return;
    }

    if (isPresetPreviewing) {
      cancelPresetPreview({ restoreZoom: false });
    }

    zoomBeforeCrop = currentZoomPercent || 100;

    // Keep current zoom, but force the <img> view while cropping.
    isCropping = true;
    applyZoomView(currentZoomPercent || Number(zoomInput?.value || zoom?.value || 100) || 100);
    isCropDragging = false;
    cropX = 0;
    cropY = 0;
    cropW = 0;
    cropH = 0;
    drawCropRect();
    setCropUi(true);

    if (cropMode === 'auto') {
      applyAutoAspectRect();
    }
  }

  function cancelCrop({ restoreZoom = true } = {}) {
    if (!isCropping) return;
    isCropping = false;
    isCropDragging = false;
    cropX = 0;
    cropY = 0;
    cropW = 0;
    cropH = 0;
    drawCropRect();
    setCropUi(false);

    if (restoreZoom) {
      const z = Math.max(1, Math.round(zoomBeforeCrop || 100));
      if (zoom) zoom.value = String(z);
      if (zoomInput) zoomInput.value = String(z);
      if (zoomValue) zoomValue.textContent = `${z}%`;
      applyZoomView(z);
    }
  }

  function computeAspectRectFromDrag(bounds, startX, startY, x, y, aspect) {
    const sx = startX;
    const sy = startY;

    const dirX = x >= sx ? 1 : -1;
    const dirY = y >= sy ? 1 : -1;

    const maxW = dirX > 0 ? bounds.right - sx : sx - bounds.left;
    const maxH = dirY > 0 ? bounds.bottom - sy : sy - bounds.top;

    let w = Math.min(Math.abs(x - sx), maxW);
    let h = Math.min(Math.abs(y - sy), maxH);

    // Fit to aspect within available space.
    if (w / Math.max(1, h) > aspect) {
      // too wide => height drives
      h = Math.min(h, maxH);
      w = h * aspect;
      if (w > maxW) {
        w = maxW;
        h = w / aspect;
      }
    } else {
      // too tall => width drives
      w = Math.min(w, maxW);
      h = w / aspect;
      if (h > maxH) {
        h = maxH;
        w = h * aspect;
      }
    }

    const endX = sx + dirX * w;
    const endY = sy + dirY * h;
    return {
      x: Math.min(sx, endX),
      y: Math.min(sy, endY),
      w: Math.abs(endX - sx),
      h: Math.abs(endY - sy),
    };
  }

  function applyPresetSize() {
    const hasImage = Boolean(naturalWidth && naturalHeight && currentObjectUrl);
    if (!hasImage || !img) return;

    const preset = parsePreset(cropPresetValue);
    if (!preset) return;

    const w = preset.w;
    const h = preset.h;
    if (!w || !h) return;

    // Always resize from a stable base (like editgambar.html), not from the latest resized output.
    const sourceFile = resampleBaseFile || originalFile;
    if (!sourceFile) {
      return;
    }

    const run = async () => {
      let source = null;

      // Prefer ImageBitmap decoding for best quality & speed.
      try {
        if ('createImageBitmap' in window) {
          source = await createImageBitmap(sourceFile);
        }
      } catch {
        source = null;
      }

      if (!source) {
        const url = URL.createObjectURL(sourceFile);
        try {
          source = await new Promise((resolve, reject) => {
            const im = new Image();
            im.onload = () => resolve(im);
            im.onerror = reject;
            im.src = url;
          });
        } catch {
          // ignore
        } finally {
          URL.revokeObjectURL(url);
        }
      }

      if (!source) {
        return;
      }

      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        if (source && source.close) source.close();
        return;
      }

      ctx.imageSmoothingEnabled = true;
      try {
        ctx.imageSmoothingQuality = 'high';
      } catch {
        // ignore
      }

      // Same behavior as editgambar.html "Ukuran Background": stretch image to target.
      ctx.drawImage(source, 0, 0, w, h);
      if (source && source.close) source.close();

      canvas.toBlob((blob) => {
        if (!blob) {
          return;
        }
        const fileName = `preset-${w}x${h}-${Date.now()}.png`;
        const outFile = new File([blob], fileName, { type: blob.type || 'image/png' });

        // IMPORTANT: keep resampleBaseFile unchanged so changing presets doesn't get progressively worse.
        loadFile(outFile, { setAsOriginal: false, setAsResampleBase: false });
      }, 'image/png');
    };

    run();
  }

  function setPresetPreviewUi(active) {
    if (!cropStartBtn || !cropCancelBtn) return;
    // Keep the "Terapkan" button visible (cropStartBtn) and show Cancel while previewing.
    cropStartBtn.hidden = false;
    cropStartBtn.disabled = !(naturalWidth && naturalHeight);
    cropCancelBtn.hidden = !active;
    if (!active && cropMode !== 'manual') {
      // keep cancel hidden when not actively previewing
      cropCancelBtn.hidden = true;
    }
  }

  function cancelPresetPreview({ restoreZoom = true } = {}) {
    if (!isPresetPreviewing) return;
    if (!presetPreviewSnapshot || !img) {
      isPresetPreviewing = false;
      if (presetPreviewObjectUrl) {
        try {
          URL.revokeObjectURL(presetPreviewObjectUrl);
        } catch {
          // ignore
        }
      }
      presetPreviewObjectUrl = null;
      presetPreviewSnapshot = null;
      setPresetPreviewUi(false);
      return;
    }

    const snap = presetPreviewSnapshot;

    // Revoke the preview URL and restore previous URL.
    if (presetPreviewObjectUrl) {
      try {
        URL.revokeObjectURL(presetPreviewObjectUrl);
      } catch {
        // ignore
      }
    }
    presetPreviewObjectUrl = null;
    isPresetPreviewing = false;
    presetPreviewSnapshot = null;

    // Restore key rendering state.
    baseDisplayWidth = snap.baseDisplayWidth || baseDisplayWidth;
    baseDisplayHeight = snap.baseDisplayHeight || baseDisplayHeight;
    panX = snap.panX || 0;
    panY = snap.panY || 0;
    currentZoomPercent = snap.zoomPercent || 100;

    if (img) {
      img.style.width = snap.imgStyleWidth || '';
      img.style.height = snap.imgStyleHeight || '';
    }

    currentObjectUrl = snap.currentObjectUrl;

    img.onload = () => {
      naturalWidth = img.naturalWidth || 0;
      naturalHeight = img.naturalHeight || 0;
      if (cropSection) cropSection.hidden = !(naturalWidth && naturalHeight);
      cropAspectTiles.forEach((b) => (b.disabled = !(naturalWidth && naturalHeight)));
      cropPresetTiles.forEach((b) => (b.disabled = !(naturalWidth && naturalHeight)));
      updateCropAutoKindUI();
      setCropMode(cropMode);
      setPresetPreviewUi(false);
      requestAnimationFrame(() => {
        const z = restoreZoom ? (snap.zoomPercent || Number(zoom?.value || 100)) : Number(zoom?.value || 100);
        if (zoom) zoom.value = String(Math.round(z));
        if (zoomInput) zoomInput.value = String(Math.round(z));
        if (zoomValue) zoomValue.textContent = `${Math.round(z)}%`;
        applyZoomView(z);
        syncControlsFromRenderedSize();
      });
    };
    img.src = snap.currentObjectUrl;
  }

  function previewPresetSize() {
    const hasImage = Boolean(naturalWidth && naturalHeight && currentObjectUrl);
    if (!hasImage || !img) return;

    const preset = parsePreset(cropPresetValue);
    if (!preset) return;

    const w = preset.w;
    const h = preset.h;
    if (!w || !h) return;

    // Snapshot current state once.
    if (!isPresetPreviewing) {
      presetPreviewSnapshot = {
        currentObjectUrl,
        naturalWidth,
        naturalHeight,
        baseDisplayWidth,
        baseDisplayHeight,
        zoomPercent: currentZoomPercent,
        panX,
        panY,
        imgStyleWidth: img.style.width || '',
        imgStyleHeight: img.style.height || '',
      };
    }

    // Always preview from the stable base (same logic as applyPresetSize).
    const sourceFile = resampleBaseFile || originalFile;
    if (!sourceFile) return;

    const run = async () => {
      let source = null;
      try {
        if ('createImageBitmap' in window) {
          source = await createImageBitmap(sourceFile);
        }
      } catch {
        source = null;
      }

      if (!source) {
        const url = URL.createObjectURL(sourceFile);
        try {
          source = await new Promise((resolve, reject) => {
            const im = new Image();
            im.onload = () => resolve(im);
            im.onerror = reject;
            im.src = url;
          });
        } catch {
          // ignore
        } finally {
          URL.revokeObjectURL(url);
        }
      }

      if (!source) return;

      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        if (source && source.close) source.close();
        return;
      }

      ctx.imageSmoothingEnabled = true;
      try {
        ctx.imageSmoothingQuality = 'high';
      } catch {
        // ignore
      }
      ctx.drawImage(source, 0, 0, w, h);
      if (source && source.close) source.close();

      canvas.toBlob((blob) => {
        if (!blob) return;

        // Replace prior preview URL.
        if (presetPreviewObjectUrl) {
          try {
            URL.revokeObjectURL(presetPreviewObjectUrl);
          } catch {
            // ignore
          }
        }

        presetPreviewObjectUrl = URL.createObjectURL(blob);
        isPresetPreviewing = true;
        currentObjectUrl = presetPreviewObjectUrl;

        img.onload = () => {
          naturalWidth = img.naturalWidth || w;
          naturalHeight = img.naturalHeight || h;
          if (cropSection) cropSection.hidden = !(naturalWidth && naturalHeight);
          cropAspectTiles.forEach((b) => (b.disabled = !(naturalWidth && naturalHeight)));
          cropPresetTiles.forEach((b) => (b.disabled = !(naturalWidth && naturalHeight)));
          updateCropAutoKindUI();
          setCropMode(cropMode);
          setPresetPreviewUi(true);

          requestAnimationFrame(() => {
            // Keep current zoom setting.
            const z = Number(zoomInput?.value || zoom?.value || 100) || 100;
            applyZoomView(z);
            syncControlsFromRenderedSize();
          });
        };
        img.src = presetPreviewObjectUrl;
      }, 'image/png');
    };

    run();
  }

  function applyCrop() {
    if (!naturalWidth || !naturalHeight || !img) return;
    if (cropW < 4 || cropH < 4) return;

    const bounds = getImageBoundsInContainer();
    if (!bounds) return;

    const scaleX = naturalWidth / bounds.width;
    const scaleY = naturalHeight / bounds.height;

    const sx = Math.round((cropX - bounds.left) * scaleX);
    const sy = Math.round((cropY - bounds.top) * scaleY);
    const sw = Math.round(cropW * scaleX);
    const sh = Math.round(cropH * scaleY);

    const safeSx = Math.max(0, Math.min(naturalWidth - 1, sx));
    const safeSy = Math.max(0, Math.min(naturalHeight - 1, sy));
    const safeSw = Math.max(1, Math.min(naturalWidth - safeSx, sw));
    const safeSh = Math.max(1, Math.min(naturalHeight - safeSy, sh));

    const canvas = document.createElement('canvas');
    canvas.width = safeSw;
    canvas.height = safeSh;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(img, safeSx, safeSy, safeSw, safeSh, 0, 0, safeSw, safeSh);

    const z = Math.max(1, Math.round(zoomBeforeCrop || 100));
    cancelCrop({ restoreZoom: false });

    canvas.toBlob((blob) => {
      if (!blob) return;
      const fileName = `cropped-${Date.now()}.png`;
      const croppedFile = new File([blob], fileName, { type: blob.type || 'image/png' });
      if (zoom) zoom.value = String(z);
      if (zoomInput) zoomInput.value = String(z);
      if (zoomValue) zoomValue.textContent = `${z}%`;
      loadFile(croppedFile, { setAsOriginal: false });
    }, 'image/png');
  }

  function captureBaseDisplaySizeFromImg() {
    if (!img || img.style.display === 'none') return;
    const rect = img.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    baseDisplayWidth = Math.round(rect.width);
    baseDisplayHeight = Math.round(rect.height);
  }

  function getBaseDisplaySize() {
    const wFromStyle = parseFloat(img?.style?.width || '');
    const hFromStyle = parseFloat(img?.style?.height || '');
    const w = Number.isFinite(wFromStyle) && wFromStyle > 0 ? wFromStyle : baseDisplayWidth;
    const h = Number.isFinite(hFromStyle) && hFromStyle > 0 ? hFromStyle : baseDisplayHeight;
    if (w > 0 && h > 0) return { width: w, height: h };

    // last resort
    if (img && img.style.display !== 'none') {
      captureBaseDisplaySizeFromImg();
      if (baseDisplayWidth && baseDisplayHeight) {
        return { width: baseDisplayWidth, height: baseDisplayHeight };
      }
    }
    return null;
  }

  function renderZoomCanvas(scale) {
    if (!zoomCanvas || !img || !naturalWidth || !naturalHeight) return;
    const base = getBaseDisplaySize();
    if (!base) return;

    // Keep canvas buffer at base size (prevents huge allocations).
    // Apply zoom using transform so layout size stays constant.
    const bw = Math.max(1, Math.round(base.width));
    const bh = Math.max(1, Math.round(base.height));

    zoomCanvas.width = bw;
    zoomCanvas.height = bh;
    zoomCanvas.style.width = bw + 'px';
    zoomCanvas.style.height = bh + 'px';
    zoomCanvas.style.transform = `translate(${panX}px, ${panY}px) scale(${scale})`;
    const ctx = zoomCanvas.getContext('2d');
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, bw, bh);
    ctx.drawImage(img, 0, 0, bw, bh);
  }

  function clampPan(scale) {
    if (!previewContainer || !zoomCanvas) return;
    const base = getBaseDisplaySize();
    if (!base) return;

    const containerW = previewContainer.clientWidth;
    const containerH = previewContainer.clientHeight;

    const scaledW = base.width * scale;
    const scaledH = base.height * scale;

    const excessX = Math.max(0, scaledW - containerW);
    const excessY = Math.max(0, scaledH - containerH);

    const limitX = excessX / 2;
    const limitY = excessY / 2;

    panX = Math.max(-limitX, Math.min(limitX, panX));
    panY = Math.max(-limitY, Math.min(limitY, panY));
  }

  function updateZoomCanvasTransform() {
    if (!zoomCanvas) return;
    const scale = currentZoomPercent / 100;
    clampPan(scale);
    zoomCanvas.style.transform = `translate(${panX}px, ${panY}px) scale(${scale})`;
  }

  function applyZoomView(percent) {
    const v = Math.max(10, Number(percent) || 100);
    const scale = v / 100;
    currentZoomPercent = v;

    if (!img) return;

    // If we have an image loaded, keep placeholder hidden.
    if (placeholder && currentObjectUrl) placeholder.style.display = 'none';

    if (v > 100 && zoomCanvas && !isCropping && !getStraightenDelta()) {
      // Capture base size BEFORE hiding the image.
      if (img.style.display !== 'none') captureBaseDisplaySizeFromImg();

      img.style.transform = '';
      if (previewContainer) previewContainer.classList.add('pannable');
      renderZoomCanvas(scale);
      zoomCanvas.style.display = 'block';
      img.style.display = 'none';
    } else {
      if (zoomCanvas) zoomCanvas.style.display = 'none';
      if (previewContainer) previewContainer.classList.remove('pannable', 'dragging');
      panX = 0;
      panY = 0;
      img.style.display = 'block';
      setImgTransform(scale);
    }
  }

  function applyStraighten() {
    const hasImage = Boolean(naturalWidth && naturalHeight && currentObjectUrl);
    if (!hasImage || !img) return;
    const angleDeg = getStraightenDelta();
    if (!Number.isFinite(angleDeg) || Math.abs(angleDeg) < 0.0001) return;

    if (isCropping) cancelCrop({ restoreZoom: false });

    const rad = (angleDeg * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    const w = naturalWidth;
    const h = naturalHeight;

    const outW = Math.ceil(Math.abs(w * cos) + Math.abs(h * sin));
    const outH = Math.ceil(Math.abs(w * sin) + Math.abs(h * cos));

    const rotCanvas = document.createElement('canvas');
    rotCanvas.width = outW;
    rotCanvas.height = outH;
    const ctx = rotCanvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, outW, outH);
    ctx.translate(outW / 2, outH / 2);
    ctx.rotate(rad);
    ctx.drawImage(img, -w / 2, -h / 2, w, h);

    const keepZoom = currentZoomPercent || 100;
    rotCanvas.toBlob((blob) => {
      if (!blob) return;
      const fileName = `straighten-${Date.now()}.png`;
      const file = new File([blob], fileName, { type: blob.type || 'image/png' });
      loadFile(file, { setAsOriginal: false, preserveResize: true });
      // Commit current slider value as the new base so the bar stays (e.g. 180° stays 180°).
      straightenBaseAngle = normalizeDeg(straightenAngle);
      straightenAngle = straightenBaseAngle;
      if (straightenInput) straightenInput.value = String(straightenAngle);
      if (straightenValueEl) {
        const v = Number(straightenAngle) || 0;
        straightenValueEl.textContent = `${v.toFixed(1)}°`.replace('.0°', '°');
      }
      if (zoom) zoom.value = String(Math.round(keepZoom));
      if (zoomInput) zoomInput.value = String(Math.round(keepZoom));
      if (zoomValue) zoomValue.textContent = `${Math.round(keepZoom)}%`;
      applyZoomView(keepZoom);
    }, 'image/png');
  }

  function getRenderedSize() {
    if (!img || img.style.display === 'none') return null;
    const rect = img.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    return { width: rect.width, height: rect.height };
  }

  function syncControlsFromRenderedSize() {
    if (!naturalWidth || !naturalHeight) return;
    const size = getRenderedSize() || (baseDisplayWidth && baseDisplayHeight ? { width: baseDisplayWidth, height: baseDisplayHeight } : null);
    if (!size) return;

    const scale = Math.min(100, Math.max(1, Math.round((size.width / naturalWidth) * 100)));

    if (isSyncing) return;
    isSyncing = true;
    if (resizeScale) resizeScale.value = String(scale);
    if (resizeScaleValue) resizeScaleValue.textContent = String(scale) + '%';
    if (resizeWidth) resizeWidth.value = String(Math.round(size.width));
    if (resizeHeight) resizeHeight.value = String(Math.round(size.height));
    isSyncing = false;
  }

  function setResizeMode(mode, { sync = true } = {}) {
    const hasImage = Boolean(naturalWidth && naturalHeight);
    const isAuto = mode === 'auto';

    if (resizeSection) resizeSection.hidden = !hasImage;

    if (resizeAutoPanel) resizeAutoPanel.hidden = !isAuto;
    if (resizeManualPanel) resizeManualPanel.hidden = isAuto;

    if (resizeScale) resizeScale.disabled = !hasImage || !isAuto;
    if (resizeWidth) resizeWidth.disabled = !hasImage || isAuto;
    if (resizeHeight) resizeHeight.disabled = !hasImage || isAuto;

    if (!hasImage) return;

    // Switching modes should not resize; just sync UI to current rendered size.
    if (sync) syncControlsFromRenderedSize();
  }

  function applyRenderedSize(targetWidth, targetHeight) {
    if (!img || !naturalWidth || !naturalHeight) return;
    const w = Math.max(1, Math.round(targetWidth));
    const h = Math.max(1, Math.round(targetHeight));
    img.style.width = w + 'px';
    img.style.height = h + 'px';

    baseDisplayWidth = w;
    baseDisplayHeight = h;

    const v = Number(zoom?.value || 100);
    if (v > 100) {
      // Keep zoom view crisp when resizing.
      currentZoomPercent = v;
      panX = 0;
      panY = 0;
      renderZoomCanvas(v / 100);
    }
  }

  function syncFromScale(percent) {
    if (!naturalWidth || !naturalHeight) return;
    const p = Math.min(100, Math.max(1, Number(percent) || 100));
    const w = (naturalWidth * p) / 100;
    const h = (naturalHeight * p) / 100;
    applyRenderedSize(w, h);

    if (isSyncing) return;
    isSyncing = true;
    if (resizeWidth) resizeWidth.value = String(Math.round(w));
    if (resizeHeight) resizeHeight.value = String(Math.round(h));
    if (resizeScale) resizeScale.value = String(Math.round(p));
    if (resizeScaleValue) resizeScaleValue.textContent = String(Math.round(p)) + '%';
    isSyncing = false;
  }

  function syncFromWidthHeight(widthValue, heightValue, keepAspect) {
    if (!naturalWidth || !naturalHeight) return;
    let w = Number(widthValue);
    let h = Number(heightValue);
    if (!Number.isFinite(w) || w <= 0) w = (naturalWidth * (Number(resizeScale?.value) || 100)) / 100;
    if (!Number.isFinite(h) || h <= 0) h = (naturalHeight * (Number(resizeScale?.value) || 100)) / 100;

    if (keepAspect) {
      const aspect = naturalWidth / naturalHeight;
      if (w && (!heightValue || !Number.isFinite(Number(heightValue)))) {
        h = w / aspect;
      } else if (h && (!widthValue || !Number.isFinite(Number(widthValue)))) {
        w = h * aspect;
      } else {
        // default: derive height from width
        h = w / aspect;
      }
    }

    applyRenderedSize(w, h);

    const scale = Math.min(100, Math.max(1, Math.round((w / naturalWidth) * 100)));
    if (isSyncing) return;
    isSyncing = true;
    if (resizeScale) resizeScale.value = String(scale);
    if (resizeScaleValue) resizeScaleValue.textContent = String(scale) + '%';
    if (resizeWidth) resizeWidth.value = String(Math.round(w));
    if (resizeHeight) resizeHeight.value = String(Math.round(h));
    isSyncing = false;
  }

  function loadFile(file, { setAsOriginal = true, preserveResize = false, setAsResampleBase = true } = {}) {
    if (!file) return;
    if (!file.type || !file.type.startsWith('image/')) {
      return;
    }
    if (setAsOriginal && file.size > MAX_BYTES) return;

    // Any real load commits the state; clear any temporary preset preview.
    if (isPresetPreviewing) {
      isPresetPreviewing = false;
      presetPreviewSnapshot = null;
      if (presetPreviewObjectUrl) {
        try {
          URL.revokeObjectURL(presetPreviewObjectUrl);
        } catch {
          // ignore
        }
      }
      presetPreviewObjectUrl = null;
      setPresetPreviewUi(false);
    }

    const preserve = preserveResize
      ? {
          mode: resizeModeManual?.checked ? 'manual' : 'auto',
          scale: resizeScale?.value,
          scaleText: resizeScaleValue?.textContent,
          width: resizeWidth?.value,
          height: resizeHeight?.value,
          lock: Boolean(lockAspect?.checked),
          baseW: baseDisplayWidth,
          baseH: baseDisplayHeight,
          styleW: img?.style?.width || '',
          styleH: img?.style?.height || '',
        }
      : null;

    if (isCropping) {
      cancelCrop({ restoreZoom: false });
    }

    if (setAsOriginal) {
      // Show loading only for user uploads (initial decode).
      setLoading(true, 'Memuat gambar...');

      cleanupAllObjectUrls();
      originalObjectUrl = URL.createObjectURL(file);
      currentObjectUrl = originalObjectUrl;

      originalFile = file;
      resampleBaseFile = file;

      // New base image => reset straighten history.
      straightenAngle = 0;
      straightenBaseAngle = 0;
      if (straightenInput) straightenInput.value = '0';
      if (straightenValueEl) straightenValueEl.textContent = '0°';
    } else {
      cleanupCurrentObjectUrl({ keepOriginal: true });
      currentObjectUrl = URL.createObjectURL(file);

      if (setAsResampleBase) {
        resampleBaseFile = file;
      }
    }

    img.onload = () => {
      // Hide upload loading overlay once the image is ready.
      hideLoading();
      if (placeholder) placeholder.style.display = 'none';
      img.style.display = 'block';
      if (zoomCanvas) zoomCanvas.style.display = 'none';

      naturalWidth = img.naturalWidth || 0;
      naturalHeight = img.naturalHeight || 0;

      if (cropSection) cropSection.hidden = !(naturalWidth && naturalHeight);

      if (cropStartBtn) {
        cropStartBtn.disabled = false;
        cropStartBtn.hidden = false;
      }
      cropAspectTiles.forEach((b) => (b.disabled = false));
      cropPresetTiles.forEach((b) => (b.disabled = false));

      updateCropAutoKindUI();

      if (straightenInput) straightenInput.disabled = false;
      if (straightenApplyBtn) straightenApplyBtn.disabled = false;

      // Preserve the currently selected crop mode UI (Manual/Aspect Ratio/Luruskan)
      // even when the image source is swapped (e.g., Reset back to original).
      setCropMode(cropMode);
      if (cropApplyBtn) {
        cropApplyBtn.hidden = true;
        cropApplyBtn.disabled = true;
      }
      if (cropCancelBtn) cropCancelBtn.hidden = true;
      if (cropOverlay) cropOverlay.hidden = true;
      if (previewContainer) previewContainer.classList.remove('cropping');

      // enable according to current mode
      const mode = preserve ? preserve.mode : (resizeModeManual?.checked ? 'manual' : 'auto');
      setResizeMode(mode, { sync: !preserve });

      if (preserve) {
        // Restore previous rendered size + UI values so Straighten doesn't alter Resize/Scale.
        baseDisplayWidth = preserve.baseW || baseDisplayWidth;
        baseDisplayHeight = preserve.baseH || baseDisplayHeight;

        const styleW = parseFloat(preserve.styleW);
        const styleH = parseFloat(preserve.styleH);
        const w = Number.isFinite(styleW) && styleW > 0 ? styleW : preserve.baseW;
        const h = Number.isFinite(styleH) && styleH > 0 ? styleH : preserve.baseH;
        if (w && h) {
          applyRenderedSize(w, h);
        }

        if (resizeModeAuto) resizeModeAuto.checked = preserve.mode === 'auto';
        if (resizeModeManual) resizeModeManual.checked = preserve.mode === 'manual';
        if (resizeScale && preserve.scale != null) resizeScale.value = String(preserve.scale);
        if (resizeScaleValue && preserve.scaleText != null) resizeScaleValue.textContent = String(preserve.scaleText);
        if (resizeWidth && preserve.width != null) resizeWidth.value = String(preserve.width);
        if (resizeHeight && preserve.height != null) resizeHeight.value = String(preserve.height);
        if (lockAspect) lockAspect.checked = Boolean(preserve.lock);
      } else {
        // Initialize controls based on the current fitted/rendered size (not forced 100%).
        requestAnimationFrame(() => requestAnimationFrame(syncControlsFromRenderedSize));
      }

      // Apply pixelated rendering if currently zoomed in.
      requestAnimationFrame(() => {
        captureBaseDisplaySizeFromImg();
        const z = Number(zoom?.value || 100);
        applyZoomView(z);
      });
    };
    img.onerror = () => {
      setLoading(false);
      resetPreview();
    };
    img.src = currentObjectUrl;
  }

  if (input) {
    input.addEventListener('change', (e) => {
      const file = e.target.files && e.target.files[0];
      if (file) loadFile(file);
    });
  }


  const openPicker = () => {
    if (isCropping) return;
    input && input.click();
  };
  if (uploadArea) uploadArea.addEventListener('click', openPicker);
  if (previewContainer) previewContainer.addEventListener('dblclick', openPicker);

  if (uploadArea) {
    uploadArea.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        openPicker();
      }
    });
  }

  if (uploadArea) {
    ['dragenter', 'dragover'].forEach((ev) =>
      uploadArea.addEventListener(ev, (e) => {
        e.preventDefault();
        uploadArea.classList.add('drag');
      })
    );
    ['dragleave', 'drop'].forEach((ev) =>
      uploadArea.addEventListener(ev, (e) => {
        e.preventDefault();
        uploadArea.classList.remove('drag');
      })
    );
    uploadArea.addEventListener('drop', (e) => {
      const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (file) loadFile(file);
    });
  }

  if (zoom) {
    zoom.addEventListener('input', (e) => {
      const v = Number(e.target.value || 100);
      if (zoomValue) zoomValue.textContent = String(Math.round(v)) + '%';
      if (zoomInput) zoomInput.value = String(Math.round(v));
      applyZoomView(v);
    });
  }

  if (zoomInput) {
    zoomInput.addEventListener('input', (e) => {
      const raw = Number(e.target.value || 100);
      const v = Math.max(10, Number.isFinite(raw) ? raw : 100);
      if (zoomValue) zoomValue.textContent = String(Math.round(v)) + '%';

      // Expand slider max dynamically to avoid a fixed upper cap.
      const maxNow = Number(zoom?.max || 0);
      if (zoom && (!maxNow || v > maxNow)) {
        const nextMax = Math.max(500, Math.ceil(v / 100) * 100);
        zoom.max = String(nextMax);
      }
      if (zoom) zoom.value = String(Math.round(v));

      applyZoomView(v);
    });
  }

  if (previewContainer) {
    previewContainer.addEventListener(
      'wheel',
      (e) => {
        if (!e.altKey) return;
        e.preventDefault();

        const current = Math.max(10, Number(zoomInput?.value || zoom?.value || 100) || 100);
        const direction = Math.sign(e.deltaY);

        // Smooth-ish zoom: wheel up => zoom in, wheel down => zoom out
        let next = current * (direction > 0 ? 0.93 : 1.07);
        // Keep numbers friendly
        next = Math.round(next);
        if (next < 10) next = 10;

        if (zoomValue) zoomValue.textContent = String(next) + '%';
        if (zoomInput) zoomInput.value = String(next);

        if (zoom) {
          const maxNow = Number(zoom.max || 0);
          if (!maxNow || next > maxNow) {
            const nextMax = Math.max(500, Math.ceil(next / 100) * 100);
            zoom.max = String(nextMax);
          }
          zoom.value = String(next);
        }

        applyZoomView(next);
      },
      { passive: false }
    );
  }

  if (previewContainer) {
    previewContainer.addEventListener('pointerdown', (e) => {
      if (isCropping) return;
      if (!zoomCanvas || zoomCanvas.style.display === 'none') return;
      if (currentZoomPercent <= 100) return;
      // Left mouse / primary pointer only
      if (e.button !== undefined && e.button !== 0) return;

      isPanning = true;
      panStartClientX = e.clientX;
      panStartClientY = e.clientY;
      panStartX = panX;
      panStartY = panY;
      previewContainer.classList.add('dragging');
      previewContainer.setPointerCapture?.(e.pointerId);
      e.preventDefault();
    });

    previewContainer.addEventListener('pointermove', (e) => {
      if (isCropping) return;
      if (!isPanning) return;
      const dx = e.clientX - panStartClientX;
      const dy = e.clientY - panStartClientY;
      panX = panStartX + dx;
      panY = panStartY + dy;
      updateZoomCanvasTransform();
      e.preventDefault();
    });

    const endPan = (e) => {
      if (!isPanning) return;
      isPanning = false;
      previewContainer.classList.remove('dragging');
      try {
        previewContainer.releasePointerCapture?.(e.pointerId);
      } catch {
        // ignore
      }
    };

    previewContainer.addEventListener('pointerup', endPan);
    previewContainer.addEventListener('pointercancel', endPan);
    previewContainer.addEventListener('pointerleave', endPan);
  }

  if (resizeScale) {
    resizeScale.addEventListener('input', (e) => {
      if (isSyncing) return;
      syncFromScale(Number(e.target.value) || 100);
    });
  }

  if (resizeWidth) {
    resizeWidth.addEventListener('input', (e) => {
      if (isSyncing) return;
      const keepAspect = Boolean(lockAspect?.checked);
      syncFromWidthHeight(e.target.value, resizeHeight?.value, keepAspect);
    });
  }

  if (resizeHeight) {
    resizeHeight.addEventListener('input', (e) => {
      if (isSyncing) return;
      const keepAspect = Boolean(lockAspect?.checked);
      syncFromWidthHeight(resizeWidth?.value, e.target.value, keepAspect);
    });
  }

  if (resizeModeAuto) {
    resizeModeAuto.addEventListener('change', () => {
      if (resizeModeAuto.checked) setResizeMode('auto');
    });
  }
  if (resizeModeManual) {
    resizeModeManual.addEventListener('change', () => {
      if (resizeModeManual.checked) setResizeMode('manual');
    });
  }

  if (resetBtn) {
    resetBtn.addEventListener('click', () => resetEditsToOriginal());
  }

  if (straightenInput) {
    straightenInput.addEventListener('input', (e) => {
      const raw = Number(e.target.value || 0);
      const v = Number.isFinite(raw) ? raw : 0;
      straightenAngle = v;
      if (straightenValueEl) straightenValueEl.textContent = `${v.toFixed(1)}°`.replace('.0°', '°');
      applyZoomView(currentZoomPercent || Number(zoomInput?.value || zoom?.value || 100) || 100);
    });
  }
  if (straightenApplyBtn) {
    straightenApplyBtn.addEventListener('click', () => applyStraighten());
  }

  if (cropStartBtn) {
    cropStartBtn.addEventListener('click', () => beginCrop());
  }
  if (cropCancelBtn) {
    cropCancelBtn.addEventListener('click', () => {
      if (isCropping) return cancelCrop();
      if (isPresetPreviewing) return cancelPresetPreview();
    });
  }
  if (cropApplyBtn) {
    cropApplyBtn.addEventListener('click', () => {
      if (isCropping) return applyCrop();
    });
  }

  if (cropModeManual) {
    cropModeManual.addEventListener('change', () => {
      if (cropModeManual.checked) setCropMode('manual');
    });
  }
  if (cropModeAuto) {
    cropModeAuto.addEventListener('change', () => {
      if (cropModeAuto.checked) setCropMode('auto');
    });
  }
  if (cropModeStraighten) {
    cropModeStraighten.addEventListener('change', () => {
      if (cropModeStraighten.checked) setCropMode('straighten');
    });
  }
  const setSelectedAspectTile = (value) => {
    cropAspectTiles.forEach((b) => {
      const isSelected = b.dataset.aspect === value;
      b.setAttribute('aria-pressed', isSelected ? 'true' : 'false');
    });
  };

  const setSelectedPresetTile = (value) => {
    cropPresetTiles.forEach((b) => {
      const isSelected = b.dataset.preset === value;
      b.setAttribute('aria-pressed', isSelected ? 'true' : 'false');
      b.classList.toggle('active', isSelected);
    });
  };

  if (cropAspectGrid) {
    cropAspectGrid.addEventListener('click', (e) => {
      const btn = e.target.closest?.('.aspect-tile');
      if (!btn) return;
      if (btn.disabled) return;
      const value = String(btn.dataset.aspect || '1:1');
      cropAspectValue = value;
      setSelectedAspectTile(value);
      if (isCropping && cropMode === 'auto') {
        applyAutoAspectRect();
      }
    });
  }

  if (cropPresetGrid) {
    cropPresetGrid.addEventListener('click', (e) => {
      const btn = e.target.closest?.('.aspect-tile');
      if (!btn) return;
      if (btn.disabled) return;
      const value = String(btn.dataset.preset || '1080x1920');
      cropPresetValue = value;
      setSelectedPresetTile(value);

      // Preview first; only commit when user clicks Terapkan.
      if (cropMode === 'auto' && cropAutoKind === 'preset' && !isCropping) {
        previewPresetSize();
        return;
      }

      if (isCropping && cropMode === 'auto') {
        applyAutoAspectRect();
      }
    });
  }

  if (cropAutoKindInputs.length) {
    cropAutoKindInputs.forEach((el) => {
      el.addEventListener('change', () => {
        const selected = cropAutoKindInputs.find((x) => x.checked)?.value;
        cropAutoKind = selected === 'preset' ? 'preset' : 'ratio';
        updateCropAutoKindUI();
        if (isPresetPreviewing && cropAutoKind !== 'preset') {
          cancelPresetPreview({ restoreZoom: false });
        }
        if (isCropping && cropMode === 'auto') {
          applyAutoAspectRect();
        }
      });
    });
  }

  // Initialize default selection
  setSelectedAspectTile(cropAspectValue);
  setSelectedPresetTile(cropPresetValue);
  updateCropAutoKindUI();

  if (cropOverlay && previewContainer) {
    const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

    cropOverlay.addEventListener('pointerdown', (e) => {
      if (!isCropping) return;
      const bounds = getImageBoundsInContainer();
      if (!bounds) return;

      const contRect = previewContainer.getBoundingClientRect();
      const xRaw = e.clientX - contRect.left;
      const yRaw = e.clientY - contRect.top;

      if (xRaw < bounds.left || xRaw > bounds.right || yRaw < bounds.top || yRaw > bounds.bottom) {
        return;
      }

      cropStartX = clamp(xRaw, bounds.left, bounds.right);
      cropStartY = clamp(yRaw, bounds.top, bounds.bottom);
      cropX = cropStartX;
      cropY = cropStartY;
      cropW = 0;
      cropH = 0;
      drawCropRect();
      isCropDragging = true;
      if (cropApplyBtn) cropApplyBtn.disabled = true;

      cropOverlay.setPointerCapture?.(e.pointerId);
      e.preventDefault();
    });

    cropOverlay.addEventListener('pointermove', (e) => {
      if (!isCropping) return;
      if (!isCropDragging) return;
      const bounds = getImageBoundsInContainer();
      if (!bounds) return;

      const contRect = previewContainer.getBoundingClientRect();
      const x = clamp(e.clientX - contRect.left, bounds.left, bounds.right);
      const y = clamp(e.clientY - contRect.top, bounds.top, bounds.bottom);

      if (cropMode === 'auto') {
        const aspect = getActiveAutoAspect();
        if (aspect) {
          const r = computeAspectRectFromDrag(bounds, cropStartX, cropStartY, x, y, aspect);
          cropX = r.x;
          cropY = r.y;
          cropW = r.w;
          cropH = r.h;
        } else {
          cropX = Math.min(cropStartX, x);
          cropY = Math.min(cropStartY, y);
          cropW = Math.abs(x - cropStartX);
          cropH = Math.abs(y - cropStartY);
        }
      } else {
        cropX = Math.min(cropStartX, x);
        cropY = Math.min(cropStartY, y);
        cropW = Math.abs(x - cropStartX);
        cropH = Math.abs(y - cropStartY);
      }
      drawCropRect();

      if (cropApplyBtn) cropApplyBtn.disabled = !(cropW >= 4 && cropH >= 4);
      e.preventDefault();
    });

    const endCropDrag = (e) => {
      if (!isCropDragging) return;
      isCropDragging = false;
      try {
        cropOverlay.releasePointerCapture?.(e.pointerId);
      } catch {
        // ignore
      }
    };
    cropOverlay.addEventListener('pointerup', endCropDrag);
    cropOverlay.addEventListener('pointercancel', endCropDrag);
    cropOverlay.addEventListener('pointerleave', endCropDrag);
  }

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && isCropping) {
      cancelCrop();
    }
  });

  resetPreview();
  window.addEventListener('beforeunload', cleanupAllObjectUrls);
});
