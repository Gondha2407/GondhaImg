// editgambar.js — clean implementation
document.addEventListener('DOMContentLoaded', () => {
    // Elements
    const fileInput = document.getElementById('file-input');
    const uploadArea = document.getElementById('upload-area');
    const imagePreview = document.getElementById('image-preview');
    const placeholder = document.querySelector('.preview-container .placeholder');
    const widthInput = document.getElementById('width');
    const heightInput = document.getElementById('height');
    const lockRatioCheckbox = document.getElementById('lock-ratio');
    const qualitySlider = document.getElementById('quality');
    const qualityValue = document.getElementById('quality-value');
    const formatSelect = document.getElementById('format-select');
    const applyBtn = document.getElementById('apply-btn');
    const resetBtn = document.getElementById('reset-btn');
    const downloadBtn = document.getElementById('download-btn');
    const originalDimensions = document.getElementById('original-dimensions');
    const newDimensions = document.getElementById('new-dimensions');
    const fileSize = document.getElementById('file-size');
    const fileFormat = document.getElementById('file-format');
    const previewContainer = document.getElementById('preview-container');
    const notification = document.getElementById('notification');
    const recentList = document.getElementById('recent-list');
    const brightnessEl = document.getElementById('brightness');
    const contrastEl = document.getElementById('contrast');
    const blurEl = document.getElementById('blur-radius');
    const blurValueEl = document.getElementById('blur-value');

    // State
    let originalImage = null; // Image object for uploaded original
    let lastCanvasDataURL = null; // Result preview
    let lastAppliedWidth = null; let lastAppliedHeight = null; // last applied preview size
    let originalWidth = 0; let originalHeight = 0; let aspectRatio = 1;
    let currentFile = null;
    let currentEffect = 'normal';
    // Snapshot of the state when an image was selected (upload or recent)
    let initialState = null;
    // Side thumbnails pagination state
    let sideThumbsData = []; // array of {src,name}
    let sideThumbsPage = 0;
    // index of the thumbnail in sideThumbsData that is currently loaded in the preview
    let currentPreviewSideIndex = null;
    // Show up to 10 thumbnails per page in the right-side panel; remaining thumbnails are available via Prev/Next
    const SIDE_THUMBS_PAGE_SIZE = 10;

    function setLoading(on) {
        if (!previewContainer) return;
        previewContainer.style.opacity = on ? '0.6' : '1';
        previewContainer.style.pointerEvents = on ? 'none' : '';
    }

    // Small utilities
    function formatFileSize(bytes) {
        if (!bytes && bytes !== 0) return '-';
        const k = 1024; const sizes = ['B','KB','MB','GB'];
        let i = 0; let val = bytes;
        while (val >= k && i < sizes.length - 1) { val = val / k; i++; }
        return `${val.toFixed(2)} ${sizes[i]}`;
    }

    // dbg used as a no-op in production — debug toggle removed per user request
    function dbg() { /* no-op */ }

    function showNotification(text, type = 'success') {
        try {
            if (!notification) return;
            const textEl = document.getElementById('notification-text');
            if (textEl) textEl.textContent = text;
            notification.classList.remove('error');
            notification.classList.remove('show');
            if (type === 'error') notification.classList.add('error');
            // trigger visible state
            setTimeout(() => notification.classList.add('show'), 10);
            setTimeout(() => notification.classList.remove('show'), 3000);
        } catch (e) { /* ignore */ }
    }
    // Wire quick preset buttons (.preset) to set effects and update UI
    (function wirePresets(){
        const presets = document.querySelectorAll('.preset');
        if (!presets || !presets.length) return;
        presets.forEach(p => p.addEventListener('click', function(){
            // clear previous active
            presets.forEach(pp => {
                pp.classList.remove('active');
                try { pp.setAttribute('aria-pressed', 'false'); } catch (e) {}
            });
            this.classList.add('active');
            try { this.setAttribute('aria-pressed', 'true'); } catch (e) {}
            // prefer data-effect (new markup). map 'none' to internal 'normal' effect name.
            const effRaw = this.dataset.effect || this.dataset.filter || 'none';
            currentEffect = effRaw === 'none' ? 'normal' : effRaw;
            // set sensible defaults for sliders
            if (brightnessEl) brightnessEl.value = 100;
            if (contrastEl) contrastEl.value = currentEffect === 'sharpen' ? 120 : 100;
            if (blurEl && currentEffect === 'blur') blurEl.value = 6;
            applyChanges(false);
        }));
    })();

    function handleImageUpload() {
        if (!fileInput || !fileInput.files || !fileInput.files.length) return;
        setLoading(true);
        const files = Array.from(fileInput.files);
        // Read all files and add them to recent thumbnails. The first file becomes the active image.
        files.forEach((f, idx) => {
            const reader = new FileReader();
            reader.onload = (ev) => {
                // For the first file, make it active in the editor
                if (idx === 0) {
                    // If there is already an image loaded in the preview, move that preview
                    // into the side thumbnails so new upload becomes the active preview.
                    try {
                        const existingPreviewSrc = (imagePreview && imagePreview.src) ? imagePreview.src : null;
                        const newSrc = ev && ev.target ? ev.target.result : null;
                        if (existingPreviewSrc && existingPreviewSrc !== '' && existingPreviewSrc !== newSrc) {
                            // Use available metadata (initialState/currentFile/originalWidth) when possible
                            const prevName = (initialState && initialState.name) ? initialState.name : (currentFile && currentFile.name) ? currentFile.name : 'image';
                            const prevWidth = (initialState && initialState.width) ? initialState.width : originalWidth || null;
                            const prevHeight = (initialState && initialState.height) ? initialState.height : originalHeight || null;
                            const prevSize = (initialState && initialState.size) ? initialState.size : estimateDataURLSize(existingPreviewSrc);
                            const prevType = (initialState && initialState.type) ? initialState.type : (currentFile && currentFile.type) ? currentFile.type : null;
                            try {
                                addToSideThumbnails({ src: existingPreviewSrc, name: prevName, width: prevWidth, height: prevHeight, size: prevSize, type: prevType });
                            } catch (e) { /* non-fatal */ }
                        }
                    } catch (e) {}

                    currentFile = f;
                    // newly uploaded image is not coming from side thumbnails, clear preview->thumb mapping
                    currentPreviewSideIndex = null;
                    originalImage = new Image();
                    originalImage.onload = () => {
                        originalWidth = originalImage.width; originalHeight = originalImage.height;
                        aspectRatio = originalWidth / originalHeight || 1;
                        if (originalDimensions) originalDimensions.textContent = `${originalWidth} × ${originalHeight}`;
                        if (widthInput) widthInput.value = originalWidth;
                        if (heightInput) heightInput.value = originalHeight;
                        if (fileSize) fileSize.textContent = formatFileSize(currentFile.size || 0);
                        if (fileFormat) fileFormat.textContent = (currentFile.type ? currentFile.type.split('/')[1] : 'image').toUpperCase();
                        if (imagePreview) { imagePreview.src = ev.target.result; imagePreview.style.display = 'block'; }
                        if (placeholder) placeholder.style.display = 'none';
                        // Save snapshot of initial state for this image
                        initialState = {
                            src: ev.target.result,
                            width: originalWidth,
                            height: originalHeight,
                            brightness: brightnessEl ? parseInt(brightnessEl.value) : 100,
                            contrast: contrastEl ? parseInt(contrastEl.value) : 100,
                            blur: blurEl ? parseInt(blurEl.value) : 6,
                            quality: qualitySlider ? parseInt(qualitySlider.value) : 80,
                            effect: 'normal',
                            name: currentFile && currentFile.name ? currentFile.name : (currentFile && currentFile.type ? currentFile.type : name) || 'image',
                            size: currentFile && currentFile.size ? currentFile.size : null,
                            type: currentFile && currentFile.type ? currentFile.type : null
                        };
                        setLoading(false);
                        showNotification('Gambar berhasil diunggah!');
                    };
                    originalImage.src = ev.target.result;
                }
                // Add every non-first file to the right-side thumbnails (side-thumbs) if present,
                // otherwise fall back to the recent list on the left.
                try {
                    if (idx === 0) {
                        // first file already handled above
                    } else if (document.getElementById('side-thumbs')) {
                        // create a temporary Image to capture natural dimensions before storing metadata
                        const tmp = new Image();
                        tmp.onload = () => {
                            addToSideThumbnails({
                                src: ev.target.result,
                                name: f.name || 'image',
                                width: tmp.naturalWidth || tmp.width || null,
                                height: tmp.naturalHeight || tmp.height || null,
                                size: f.size || null,
                                type: f.type || null
                            });
                        };
                        tmp.src = ev.target.result;
                    } else {
                        addToRecentImages(ev.target.result, f.name || 'image');
                    }
                } catch (e) { /* non-fatal */ }
            };
            reader.readAsDataURL(f);
        });

        // If multiple files were uploaded, make the recent thumbnails visible and notify the user.
        if (files.length > 1) {
            // small delay to allow FileReader onload handlers to run and populate lists
            setTimeout(() => {
                const side = document.getElementById('side-thumbs');
                if (side && side.children && side.children.length) {
                    try { side.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (e) { side.scrollIntoView(); }
                    showNotification(`${files.length} gambar ditambahkan di sebelah kanan Pratinjau`);
                    return;
                }
                if (recentList && recentList.children && recentList.children.length) {
                    try { recentList.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (e) { recentList.scrollIntoView(); }
                    showNotification(`${files.length} gambar ditambahkan ke Terakhir`);
                }
            }, 300);
        }
    }

    function handleSizeInput(e) {
        if (!originalImage) return;
        if (lockRatioCheckbox && lockRatioCheckbox.checked) {
            if (e.target === widthInput) {
                const w = parseInt(widthInput.value) || 1; heightInput.value = Math.round(w / aspectRatio);
            } else if (e.target === heightInput) {
                const h = parseInt(heightInput.value) || 1; widthInput.value = Math.round(h * aspectRatio);
            }
        }
        if (newDimensions) newDimensions.textContent = `${widthInput.value || '-'} × ${heightInput.value || '-'}`;
    }

    // Core processing
    // syncToThumbnail: when false, only update the preview (do not write back into sideThumbsData)
    function applyChanges(syncToThumbnail = true) {
        if (!originalImage) { showNotification('Unggah gambar terlebih dahulu', 'error'); return; }
        setLoading(true);
        dbg('applyChanges() invoked');
        setTimeout(() => {
            const w = parseInt(widthInput.value) || originalWidth;
            const h = parseInt(heightInput.value) || originalHeight;
            const canvas = document.createElement('canvas');
            canvas.width = w; canvas.height = h;
            const ctx = canvas.getContext('2d');

                    const brightness = brightnessEl ? brightnessEl.value : 100;
                    const contrast = contrastEl ? contrastEl.value : 100;
                    const blurRadius = blurEl ? parseInt(blurEl.value, 10) : 6;

                    // Build base filter (without blur by default). We'll handle blur specially for quality/perf.
                    let baseFilter = `brightness(${brightness}%) contrast(${contrast}%)`;

                    // Quick filter presets map — these approximate Instagram-like filters
                    const quickMap = {
                        clarendon: ' saturate(120%) contrast(110%) hue-rotate(-6deg)',
                        juno: ' saturate(130%) contrast(115%) brightness(105%)',
                        lark: ' saturate(105%) brightness(110%) contrast(105%)',
                        moon: ' grayscale(100%) contrast(120%)',
                        reyes: ' sepia(10%) saturate(90%) contrast(95%) brightness(105%)',
                        slumber: ' sepia(8%) saturate(85%) contrast(90%) brightness(103%)',
                        crema: ' sepia(12%) contrast(95%) brightness(105%) saturate(95%)',
                        vintage: ' sepia(30%) saturate(90%) contrast(95%)'
                    };

                    const extra = quickMap[currentEffect] || '';

                    // If blur is selected and radius is small, use native ctx.filter for speed.
                    if (currentEffect === 'blur' && blurRadius > 0 && blurRadius <= 8) {
                        ctx.filter = `${baseFilter}${extra} blur(${blurRadius}px)`;
                        ctx.drawImage(originalImage, 0, 0, w, h);
                    } else {
                        // draw base image first (no heavy blur)
                        ctx.filter = `${baseFilter}${extra}`;
                        ctx.drawImage(originalImage, 0, 0, w, h);
                    }

                    if (currentEffect === 'sharpen') {
                // apply a simple 3x3 sharpen convolution
                const imgData = ctx.getImageData(0, 0, w, h);
                const out = ctx.createImageData(w, h);
                const data = imgData.data, od = out.data;
                // sharpen kernel
                const kernel = [0, -1, 0, -1, 5, -1, 0, -1, 0];
                const kw = 3; const kh = 3; const half = 1;
                for (let y = 0; y < h; y++) {
                    for (let x = 0; x < w; x++) {
                        let r = 0, g = 0, b = 0, a = 0;
                        for (let ky = -half; ky <= half; ky++) {
                            for (let kx = -half; kx <= half; kx++) {
                                const px = Math.min(w - 1, Math.max(0, x + kx));
                                const py = Math.min(h - 1, Math.max(0, y + ky));
                                const idx = (py * w + px) * 4;
                                const kval = kernel[(ky + half) * kw + (kx + half)];
                                r += data[idx] * kval; g += data[idx + 1] * kval; b += data[idx + 2] * kval; a += data[idx + 3] * kval;
                            }
                        }
                        const i = (y * w + x) * 4;
                        od[i] = Math.min(255, Math.max(0, r));
                        od[i + 1] = Math.min(255, Math.max(0, g));
                        od[i + 2] = Math.min(255, Math.max(0, b));
                        od[i + 3] = data[i + 3];
                    }
                }
                ctx.putImageData(out, 0, 0);
                    } else if (currentEffect === 'blur') {
                // If we reached here, either radius > 8 (use downscale method) or radius == 0 (no-op)
                if (blurRadius > 8) {
                    // Downscale -> blur -> upscale. This is faster and visually pleasing for strong blur.
                    const factor = Math.max(2, Math.min(16, Math.round(blurRadius / 3)));
                    const sw = Math.max(1, Math.round(w / factor));
                    const sh = Math.max(1, Math.round(h / factor));
                    const tmp = document.createElement('canvas'); tmp.width = sw; tmp.height = sh;
                    const tctx = tmp.getContext('2d');
                    // apply a proportionally smaller blur on the tiny canvas
                    const smallBlur = Math.max(1, Math.round(blurRadius / factor));
                    tctx.filter = `blur(${smallBlur}px)`;
                    // draw original image scaled down into temp canvas
                    tctx.drawImage(originalImage, 0, 0, sw, sh);
                    // upscale back into main canvas with smoothing to achieve soft blur
                    ctx.save();
                    ctx.clearRect(0, 0, w, h);
                    ctx.imageSmoothingEnabled = true;
                    ctx.drawImage(tmp, 0, 0, sw, sh, 0, 0, w, h);
                    ctx.restore();
                }
                    } else if (currentEffect === 'pixelate') {
                const size = Math.max(2, Math.floor(Math.min(w, h) / 60));
                const tmp = document.createElement('canvas');
                tmp.width = Math.ceil(w / size); tmp.height = Math.ceil(h / size);
                const tctx = tmp.getContext('2d');
                tctx.drawImage(canvas, 0, 0, tmp.width, tmp.height);
                ctx.imageSmoothingEnabled = false;
                ctx.clearRect(0, 0, w, h);
                ctx.drawImage(tmp, 0, 0, tmp.width, tmp.height, 0, 0, w, h);
                    } else if (currentEffect === 'invert') {
                        // color invert
                        const imgd = ctx.getImageData(0, 0, w, h);
                        const d = imgd.data;
                        for (let i = 0; i < d.length; i += 4) {
                            d[i] = 255 - d[i];
                            d[i + 1] = 255 - d[i + 1];
                            d[i + 2] = 255 - d[i + 2];
                        }
                        ctx.putImageData(imgd, 0, 0);
                    } else if (currentEffect === 'noise') {
                        // add grain/noise
                        const intensity = 25; // default intensity
                        const imgd = ctx.getImageData(0, 0, w, h);
                        const d = imgd.data;
                        for (let i = 0; i < d.length; i += 4) {
                            const rand = (Math.random() * 2 - 1) * intensity;
                            d[i] = Math.min(255, Math.max(0, d[i] + rand));
                            d[i + 1] = Math.min(255, Math.max(0, d[i + 1] + rand));
                            d[i + 2] = Math.min(255, Math.max(0, d[i + 2] + rand));
                        }
                        ctx.putImageData(imgd, 0, 0);
                    } else if (currentEffect === 'vignette') {
                        // vignette via radial gradient overlay
                        const gx = w / 2; const gy = h / 2;
                        const radius = Math.max(w, h) * 0.7;
                        const grad = ctx.createRadialGradient(gx, gy, Math.min(w, h) * 0.1, gx, gy, radius);
                        grad.addColorStop(0, 'rgba(0,0,0,0)');
                        grad.addColorStop(1, 'rgba(0,0,0,0.55)');
                        ctx.save();
                        ctx.globalCompositeOperation = 'multiply';
                        ctx.fillStyle = grad;
                        ctx.fillRect(0, 0, w, h);
                        ctx.restore();
            } else if (currentEffect === 'sepia' || currentEffect === 'grayscale') {
                const imgd = ctx.getImageData(0, 0, w, h);
                const d = imgd.data;
                for (let i = 0; i < d.length; i += 4) {
                    const r = d[i], g = d[i + 1], b = d[i + 2];
                    if (currentEffect === 'sepia') {
                        d[i] = Math.min(255, (r * .393) + (g * .769) + (b * .189));
                        d[i + 1] = Math.min(255, (r * .349) + (g * .686) + (b * .168));
                        d[i + 2] = Math.min(255, (r * .272) + (g * .534) + (b * .131));
                    } else {
                        const avg = (r + g + b) / 3; d[i] = d[i + 1] = d[i + 2] = avg;
                    }
                }
                ctx.putImageData(imgd, 0, 0);
            }

            const quality = qualitySlider ? (qualitySlider.value / 100) : 0.9;
            const format = (formatSelect && formatSelect.value) ? formatSelect.value : 'image/jpeg';
            try {
                if (format === 'image/png') {
                    // PNG ignores quality parameter
                    lastCanvasDataURL = canvas.toDataURL('image/png');
                } else {
                    lastCanvasDataURL = canvas.toDataURL(format, quality);
                }
            } catch (e) {
                // Fallback to default jpeg
                lastCanvasDataURL = canvas.toDataURL('image/jpeg', quality);
            }
            if (imagePreview) { imagePreview.src = lastCanvasDataURL; imagePreview.style.display = 'block'; }
            // Update displayed file format to match chosen export format
            try {
                if (fileFormat) {
                    const fmtLabel = (function(f){
                        if (!f) return '-';
                        const lower = f.toLowerCase();
                        if (lower.indexOf('jpeg') !== -1 || lower.indexOf('jpg') !== -1) return 'JPG';
                        if (lower.indexOf('png') !== -1) return 'PNG';
                        if (lower.indexOf('webp') !== -1) return 'WEBP';
                        const parts = f.split('/'); return (parts[1] || f).toUpperCase();
                    })(format);
                    fileFormat.textContent = fmtLabel;
                }
            } catch (e) { /* non-fatal */ }
            if (placeholder) placeholder.style.display = 'none';
            // update shown "Baru" dimensions for preview
            if (newDimensions) newDimensions.textContent = `${w} × ${h}`;
            lastAppliedWidth = w; lastAppliedHeight = h;
            dbg('applyChanges -> produced preview', { width: w, height: h, currentPreviewSideIndex: currentPreviewSideIndex });
            // If the preview corresponds to a thumbnail entry, update that thumbnail (only when requested)
            try {
                if (syncToThumbnail && currentPreviewSideIndex !== null && typeof currentPreviewSideIndex !== 'undefined' && sideThumbsData[currentPreviewSideIndex]) {
                    const ti = sideThumbsData[currentPreviewSideIndex];
                    // ensure original metadata kept
                    if (!ti.originalSrc) ti.originalSrc = ti.src;
                    if (!ti.originalWidth && ti.width) ti.originalWidth = ti.width;
                    if (!ti.originalHeight && ti.height) ti.originalHeight = ti.height;
                    // update thumbnail to the new edited preview
                    ti.src = lastCanvasDataURL;
                    // set thumbnail type to the export format used
                    try { ti.type = format || ti.type; } catch (e) {}
                    ti.width = w; ti.height = h;
                    const approx = estimateDataURLSize(lastCanvasDataURL);
                    ti.size = approx || ti.size;
                    ti.applied = true; ti.appliedTo = `${w}×${h}`;
                    // re-render thumbnails so the 'Baru' metadata updates
                    try { renderSideThumbs(sideThumbsPage); } catch (e) {}
                }
            } catch (e) { /* non-fatal */ }
            setLoading(false);
            showNotification('Perubahan diterapkan');
            addToRecentImages(lastCanvasDataURL, 'edited');
                // Additional overlays / finishing touches for some quick filters
                try {
                    if (currentEffect === 'vintage') {
                        // subtle film grain + vignette
                        drawNoise(ctx, w, h, 0.06);
                        drawVignette(ctx, w, h, 0.45);
                    } else if (currentEffect === 'slumber') {
                        // dreamy pink tint overlay
                        ctx.save();
                        ctx.globalCompositeOperation = 'overlay';
                        ctx.fillStyle = 'rgba(255,192,203,0.06)';
                        ctx.fillRect(0, 0, w, h);
                        ctx.restore();
                    } else if (currentEffect === 'reyes') {
                        // soft vignette for Reyes
                        drawVignette(ctx, w, h, 0.25);
                    }
                } catch (e) {
                    // non-fatal; continue
                }
        }, 60);
    }

    function downloadImage() {
        // Determine desired format and quality
        const format = (formatSelect && formatSelect.value) ? formatSelect.value : 'image/jpeg';
        const quality = qualitySlider ? (qualitySlider.value / 100) : 0.9;

        // Use the current preview if available (lastCanvasDataURL or imagePreview.src)
        const src = lastCanvasDataURL || (imagePreview ? imagePreview.src : null);
        if (!src) { showNotification('Tidak ada hasil untuk diunduh', 'error'); return; }

        const img = new Image();
        img.onload = () => {
            const w = parseInt(widthInput.value) || img.width;
            const h = parseInt(heightInput.value) || img.height;
            const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, w, h);
            let dataUrl;
            try {
                if (format === 'image/png') dataUrl = canvas.toDataURL('image/png');
                else dataUrl = canvas.toDataURL(format, quality);
            } catch (e) {
                dataUrl = canvas.toDataURL();
            }

            const a = document.createElement('a');
            const ext = format === 'image/png' ? 'png' : format === 'image/webp' ? 'webp' : 'jpg';
            a.href = dataUrl;
            a.download = currentFile && currentFile.name ? `edited-${currentFile.name.replace(/\.[^/.]+$/, '')}.${ext}` : `edited-image.${ext}`;
            a.click();
            showNotification('Gambar diunduh');
        };
        img.src = src;
    }

    /* -----------------------------
       Download modal & helpers
       ----------------------------- */

    // Convert dataURL to Blob (works for data: URIs)
    function dataURLToBlob(dataURL) {
        if (!dataURL) return null;
        // data:[<mediatype>][;base64],<data>
        const parts = dataURL.split(',');
        if (parts.length < 2) return null;
        const header = parts[0];
        const isBase64 = header.indexOf(';base64') !== -1;
        const mimeMatch = header.match(/:(.*?);/);
        const mime = mimeMatch ? mimeMatch[1] : 'application/octet-stream';
        const data = parts[1];
        if (isBase64) {
            const byteString = atob(data);
            const ab = new ArrayBuffer(byteString.length);
            const ia = new Uint8Array(ab);
            for (let i = 0; i < byteString.length; i++) ia[i] = byteString.charCodeAt(i);
            return new Blob([ab], { type: mime });
        }
        // percent-encoded
        const decoded = decodeURIComponent(data);
        const arr = new Uint8Array(decoded.length);
        for (let i = 0; i < decoded.length; i++) arr[i] = decoded.charCodeAt(i);
        return new Blob([arr], { type: mime });
    }

    async function fetchSrcAsBlob(src) {
        if (!src) return null;
        try {
            if (src.startsWith('data:')) return dataURLToBlob(src);
            // remote URL: fetch
            const r = await fetch(src, { mode: 'cors' });
            if (!r.ok) return null;
            return await r.blob();
        } catch (e) {
            // fallback: try to construct blob via image -> canvas
            return new Promise((resolve) => {
                try {
                    const img = new Image(); img.crossOrigin = 'anonymous';
                    img.onload = () => {
                        const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight;
                        const ctx = c.getContext('2d'); ctx.drawImage(img, 0, 0);
                        try { c.toBlob(b => resolve(b), 'image/png'); } catch (err) { resolve(null); }
                    };
                    img.onerror = () => resolve(null);
                    img.src = src;
                } catch (err) { resolve(null); }
            });
        }
    }

    function downloadBlob(blob, filename) {
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href = url; a.download = filename || 'image'; document.body.appendChild(a);
        a.click(); setTimeout(() => { try { URL.revokeObjectURL(url); a.remove(); } catch (e) {} }, 5000);
    }

    // Build and show modal to choose images to download (preview + side-thumbs)
    function showDownloadModal() {
        // gather list: first preview, then sideThumbsData
        const list = [];
        const previewSrc = lastCanvasDataURL || (imagePreview ? imagePreview.src : null);
        if (previewSrc) list.push({ src: previewSrc, name: (currentFile && currentFile.name) ? `preview-${currentFile.name}` : 'preview.png' });
        sideThumbsData.forEach((it, i) => {
            if (it && it.src) list.push({ src: it.src, name: it.name ? it.name.replace(/\s+/g,'_') : `image-${i+1}.png` });
        });

        let backdrop = document.getElementById('download-modal-backdrop');
        if (!backdrop) {
            backdrop = document.createElement('div'); backdrop.id = 'download-modal-backdrop'; backdrop.className = 'apply-modal-backdrop';
            const modal = document.createElement('div'); modal.className = 'apply-modal';
            modal.innerHTML = `
                <h3>Unduh Gambar</h3>
                <div class="modal-body" style="display:flex;gap:12px;">
                    <div style="flex:1;min-width:320px;">
                        <p class="small">Pilih gambar untuk diunduh (Pratinjau berada di paling atas)</p>
                        <div id="download-list" style="display:grid;grid-template-columns:1fr;gap:8px;max-height:360px;overflow:auto;padding:6px;border-radius:6px"></div>
                        <div style="display:flex;gap:8px;margin-top:10px;justify-content:flex-end">
                            <button class="ghost" id="download-cancel">Batal</button>
                            <button class="ghost" id="download-individual">Unduh Terpilih (Satu-per-satu)</button>
                            <button class="apply-btn" id="download-zip">Unduh Terpilih (ZIP)</button>
                        </div>
                    </div>
                    <div style="width:200px;border-left:1px solid #f2f2f2;padding-left:12px;">
                        <p class="small">Ringkasan</p>
                        <div id="download-summary">0 gambar</div>
                        <div style="margin-top:8px;font-size:0.9rem;color:#444">Format file mengikuti sumber (JPEG/PNG/WEBP). Untuk ZIP, semua file akan dikemas.</div>
                    </div>
                </div>
            `;
            backdrop.appendChild(modal); document.body.appendChild(backdrop);

            backdrop.querySelector('#download-cancel').addEventListener('click', () => { backdrop.classList.remove('show'); });

            backdrop.querySelector('#download-individual').addEventListener('click', async () => {
                // Download all items one-by-one (sequential). Re-encode each item to the
                // currently selected export format/quality so downloads match UI choices.
                backdrop.classList.remove('show');
                try {
                    const chosenFmt = (formatSelect && formatSelect.value) ? formatSelect.value : 'image/jpeg';
                    const chosenQ = qualitySlider ? (qualitySlider.value / 100) : 0.9;
                    for (let i = 0; i < list.length; i++) {
                        const it = list[i];
                        // attempt to re-encode via canvas to force format; fall back to fetching original blob
                        try {
                            // compute sensible target dimensions: use widthInput/heightInput for preview, or sideThumbsData metadata
                            let w = (i === 0) ? (lastAppliedWidth || parseInt(widthInput.value) || null) : null;
                            let h = (i === 0) ? (lastAppliedHeight || parseInt(heightInput.value) || null) : null;
                            if (!w || !h) {
                                const meta = sideThumbsData[i - 1];
                                if (meta) { w = meta.width || meta.originalWidth || meta.naturalWidth || null; h = meta.height || meta.originalHeight || meta.naturalHeight || null; }
                            }
                            // If we still don't have dims, skip explicit resize and let resizeDataURL use image natural size
                            const dataUrl = await resizeDataURL(it.src, w || undefined, h || undefined, chosenFmt, chosenQ);
                            if (dataUrl && dataUrl.indexOf('data:') === 0) {
                                const blob = dataURLToBlob(dataUrl);
                                const ext = chosenFmt === 'image/png' ? 'png' : chosenFmt === 'image/webp' ? 'webp' : 'jpg';
                                const name = (it.name || `image-${i+1}`).replace(/\.[^/.]+$/, '') + `.${ext}`;
                                downloadBlob(blob, name);
                                continue;
                            }
                        } catch (err) {
                            console.warn('re-encode failed, falling back to original blob', err);
                        }
                        // fallback: fetch original blob and download as-is
                        try {
                            const blob2 = await fetchSrcAsBlob(it.src);
                            if (blob2) downloadBlob(blob2, it.name || `image-${i+1}.png`);
                        } catch (err2) { console.error('download individual fallback error', err2); }
                    }
                } catch (err) { console.error('download individual error', err); }
            });

            backdrop.querySelector('#download-zip').addEventListener('click', async () => {
                // Zip all items in the current list, re-encoding each to the chosen export format
                backdrop.classList.remove('show');
                try {
                    if (typeof JSZip === 'undefined') {
                        showNotification('JSZip tidak tersedia — unduh satu-per-satu sebagai gantinya', 'error');
                        return;
                    }
                    const zip = new JSZip();
                    const folder = zip.folder('images') || zip;
                    const chosenFmt = (formatSelect && formatSelect.value) ? formatSelect.value : 'image/jpeg';
                    const chosenQ = qualitySlider ? (qualitySlider.value / 100) : 0.9;
                    for (let i = 0; i < list.length; i++) {
                        const it = list[i];
                        try {
                            let w = (i === 0) ? (lastAppliedWidth || parseInt(widthInput.value) || undefined) : undefined;
                            let h = (i === 0) ? (lastAppliedHeight || parseInt(heightInput.value) || undefined) : undefined;
                            if (!w || !h) {
                                const meta = sideThumbsData[i - 1];
                                if (meta) { w = meta.width || meta.originalWidth || undefined; h = meta.height || meta.originalHeight || undefined; }
                            }
                            const dataUrl = await resizeDataURL(it.src, w, h, chosenFmt, chosenQ);
                            if (dataUrl && dataUrl.indexOf('data:') === 0) {
                                const blob = dataURLToBlob(dataUrl);
                                const ext = chosenFmt === 'image/png' ? 'png' : chosenFmt === 'image/webp' ? 'webp' : 'jpg';
                                const name = (it.name || `image-${i+1}`).replace(/\.[^/.]+$/, '') + `.${ext}`;
                                folder.file(name, blob);
                                continue;
                            }
                        } catch (err) {
                            // continue to fallback fetch
                            console.warn('zip re-encode failed, falling back to original blob', err);
                        }
                        try {
                            const b = await fetchSrcAsBlob(it.src);
                            if (b) folder.file(it.name || `image-${i+1}.png`, b);
                        } catch (err2) { console.error('zip fallback fetch error', err2); }
                    }
                    const zblob = await zip.generateAsync({ type: 'blob' });
                    downloadBlob(zblob, 'images.zip');
                } catch (err) {
                    console.error('zip error', err); showNotification('Gagal membuat ZIP — coba unduh satu-per-satu', 'error');
                }
            });
        }

        // populate list each time so it reflects current sideThumbsData
        const listEl = backdrop.querySelector('#download-list'); const summaryEl = backdrop.querySelector('#download-summary');
        listEl.innerHTML = '';
        const items = list.slice();
        items.forEach((it, idx) => {
            const wrap = document.createElement('div'); wrap.className = 'sel-thumb'; wrap.style.display = 'flex'; wrap.style.alignItems = 'center'; wrap.style.gap = '8px'; wrap.style.justifyContent = 'space-between'; wrap.style.padding = '6px'; wrap.style.borderRadius = '6px';
            const left = document.createElement('div'); left.style.display = 'flex'; left.style.alignItems = 'center'; left.style.gap = '8px';
            const thumb = document.createElement('img'); thumb.src = it.src; thumb.style.width = '56px'; thumb.style.height = '40px'; thumb.style.objectFit = 'cover'; thumb.alt = it.name || `img${idx+1}`;
            const meta = document.createElement('div'); meta.style.flex = '1'; meta.innerHTML = `<div style="font-weight:600">${it.name || `image-${idx+1}`}</div><div style="font-size:0.85rem;color:#666">${idx===0? 'Pratinjau' : 'Thumbnail'}</div>`;
            left.appendChild(thumb); left.appendChild(meta);

            const dlBtn = document.createElement('button');
            // Preview item gets a primary download label; thumbnails get a smaller ghost button
            if (idx === 0) {
                dlBtn.className = 'apply-btn'; dlBtn.textContent = 'Unduh Pratinjau';
            } else {
                dlBtn.className = 'ghost'; dlBtn.textContent = 'Unduh';
            }
            dlBtn.addEventListener('click', async (e) => {
                e.preventDefault();
                try {
                    const chosenFmt = (formatSelect && formatSelect.value) ? formatSelect.value : 'image/jpeg';
                    const chosenQ = qualitySlider ? (qualitySlider.value / 100) : 0.9;
                    // Try to re-encode to chosen format using canvas helper
                    try {
                        let w = (idx === 0) ? (lastAppliedWidth || parseInt(widthInput.value) || undefined) : undefined;
                        let h = (idx === 0) ? (lastAppliedHeight || parseInt(heightInput.value) || undefined) : undefined;
                        if (!w || !h) {
                            const meta = sideThumbsData[idx - 1];
                            if (meta) { w = meta.width || meta.originalWidth || undefined; h = meta.height || meta.originalHeight || undefined; }
                        }
                        const dataUrl = await resizeDataURL(it.src, w, h, chosenFmt, chosenQ);
                        if (dataUrl && dataUrl.indexOf('data:') === 0) {
                            const blob = dataURLToBlob(dataUrl);
                            const ext = chosenFmt === 'image/png' ? 'png' : chosenFmt === 'image/webp' ? 'webp' : 'jpg';
                            const name = (it.name || `image-${idx+1}`).replace(/\.[^/.]+$/, '') + `.${ext}`;
                            downloadBlob(blob, name);
                            return;
                        }
                    } catch (err) { console.warn('individual re-encode failed, falling back', err); }

                    // fallback: download original blob
                    const blob2 = await fetchSrcAsBlob(it.src);
                    if (!blob2) { showNotification('Gagal mengunduh gambar', 'error'); return; }
                    downloadBlob(blob2, it.name || `image-${idx+1}.png`);
                } catch (err) { console.error('individual download error', err); showNotification('Gagal mengunduh gambar', 'error'); }
            });

            wrap.appendChild(left);
            wrap.appendChild(dlBtn);
            listEl.appendChild(wrap);
        });
        summaryEl.textContent = `${items.length} gambar tersedia`;

        backdrop.classList.add('show');
    }


    /* -----------------------------
       Bulk apply helpers & modal
       ----------------------------- */

    // Resize a dataURL image to w x h using canvas and return a Promise<dataURL>
    function resizeDataURL(src, w, h, fmt, q) {
        return new Promise((resolve, reject) => {
            if (!src) return resolve(src);
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = () => {
                try {
                    const canvas = document.createElement('canvas');
                    canvas.width = w; canvas.height = h;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0, w, h);
                    let dataUrl;
                    try {
                        if (fmt === 'image/png') dataUrl = canvas.toDataURL('image/png');
                        else dataUrl = canvas.toDataURL(fmt || 'image/jpeg', q || 0.9);
                    } catch (e) { dataUrl = canvas.toDataURL(); }
                    resolve(dataUrl);
                } catch (err) { resolve(src); }
            };
            img.onerror = () => resolve(src);
            img.src = src;
        });
    }

    // Helper to compute approximate bytes from a base64 dataURL
    function estimateDataURLSize(dataUrl) {
        if (!dataUrl) return null;
        const idx = dataUrl.indexOf(',');
        if (idx < 0) return null;
        const b64 = dataUrl.slice(idx + 1).replace(/\s/g, '');
        const padding = (b64.endsWith('==') ? 2 : (b64.endsWith('=') ? 1 : 0));
        return Math.floor((b64.length * 3) / 4) - padding;
    }

    // Apply resize to a set of indices in sideThumbsData
    // Apply resize to a set of indices in sideThumbsData. Stores original values if not present,
    // and marks items as applied=true.
    async function applyToIndexes(indexes, w, h, fmt, q) {
        if (!indexes || !indexes.length) return;
        try { dbg('applyToIndexes -> indexes:', indexes, 'size:', w, 'x', h, 'fmt:', fmt, 'q:', q); } catch(e) {}
        setLoading(true);
        const toProcess = Array.from(indexes);
        for (let i = 0; i < toProcess.length; i++) {
            const idx = toProcess[i];
            const item = sideThumbsData[idx];
            if (!item || !item.src) continue;
            // ensure original metadata exists so we can revert later
            if (!item.originalSrc) { item.originalSrc = item.src; }
            if (!item.originalWidth && item.width) item.originalWidth = item.width;
            if (!item.originalHeight && item.height) item.originalHeight = item.height;
            if (!item.originalSize && item.size) item.originalSize = item.size;
            // perform resize
            try {
                const newSrc = await resizeDataURL(item.src, w, h, fmt, q);
                item.src = newSrc;
                    // update stored MIME/type to reflect chosen export format
                    try { item.type = fmt || item.type; } catch (e) {}
                item.width = w; item.height = h;
                const approx = estimateDataURLSize(newSrc);
                item.size = approx || item.size;
                item.applied = true;
                item.appliedTo = `${w}×${h}`;
            } catch (e) {
                // continue on error
            }
        }
        // re-render current page to reflect changes
        renderSideThumbs(sideThumbsPage);
        setLoading(false);
        showNotification('Ukuran telah diterapkan ke gambar terpilih');
    }

    // Process selection: apply chosen size to checkedIndexes, revert the others (that were previously applied)
    async function processSelection(checkedIndexes, w, h, fmt, q, revertUnselected = false) {
        setLoading(true);
        dbg('processSelection start', { checkedIndexes: checkedIndexes, target: `${w}x${h}`, revertUnselected });
        // Build sets for quick lookup
        const checkedSet = new Set((checkedIndexes || []).map(n => parseInt(n, 10)));
        // First, apply to checked items (those the user wants to keep/apply)
        const toApply = [];
        const toRevert = [];
        for (let i = 0; i < sideThumbsData.length; i++) {
            const it = sideThumbsData[i];
            const isChecked = checkedSet.has(i);
            // If checked and not already applied to this size, apply
            if (isChecked) {
                if (!(it.applied && it.appliedTo === `${w}×${h}`)) toApply.push(i);
            } else {
                // If not checked and we explicitly want to revert unselected items,
                // then collect those that are currently applied so they can be reverted.
                if (revertUnselected && it.applied) toRevert.push(i);
            }
        }
        if (toApply.length) await applyToIndexes(toApply, w, h, fmt, q);
        // Revert: restore originalSrc/size/width/height for the indexes in toRevert
        if (toRevert.length) {
            for (let j = 0; j < toRevert.length; j++) {
                const idx = toRevert[j];
                const it = sideThumbsData[idx];
                if (!it) continue;
                if (it.originalSrc) {
                    it.src = it.originalSrc;
                    it.width = it.originalWidth || it.width;
                    it.height = it.originalHeight || it.height;
                    it.size = it.originalSize || it.size;
                    it.applied = false;
                    it.appliedTo = null;
                }
            }
            renderSideThumbs(sideThumbsPage);
        }
        setLoading(false);
        showNotification('Perubahan diterapkan');
    }

    // Create / show modal to choose apply-to behavior
    function showApplyModal() {
        if (!widthInput || !heightInput) { applyChanges(); return; }
        const w = parseInt(widthInput.value) || originalWidth;
        const h = parseInt(heightInput.value) || originalHeight;
        const fmt = (formatSelect && formatSelect.value) ? formatSelect.value : 'image/jpeg';
        const q = qualitySlider ? (qualitySlider.value / 100) : 0.9;
        // Build modal once (create DOM), but always update its contents when opened
        let backdrop = document.getElementById('apply-modal-backdrop');
        if (!backdrop) {
                        backdrop = document.createElement('div'); backdrop.id = 'apply-modal-backdrop'; backdrop.className = 'apply-modal-backdrop';
                        const modal = document.createElement('div'); modal.className = 'apply-modal';
                                    modal.innerHTML = `
                                <h3>Terapkan Ukuran Background</h3>
                                <div class="modal-body">
                                    <div class="modal-left" style="padding-right:12px;min-width:260px;">
                                        <p class="small">Ukuran yang dipilih</p>
                                        <div class="info-bar" style="margin-bottom:8px;"><div class="info" style="font-weight:600;font-size:1rem">${w} × ${h}</div></div>
                                        <div class="note">Pilih target penerapan: Pratinjau saat ini, Semua gambar, atau pilih gambar tertentu di sebelah kanan.</div>
                                        <div class="modal-actions" style="margin-top:14px;display:flex;gap:8px;justify-content:flex-end;">
                                            <button class="ghost" id="apply-preview">Terapkan ke Pratinjau</button>
                                            <button class="apply-btn" id="apply-all">Terapkan ke Semua</button>
                                        </div>
                                    </div>
                                    <div class="modal-right">
                                        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px"><strong>Pilih gambar (opsional)</strong><button id="show-select" class="ghost">Pilih</button></div>
                                        <div id="apply-thumb-list" class="thumb-list" aria-label="Pilih gambar untuk menerapkan" style="display:none"></div>
                                    </div>
                                </div>
                        `;
                        backdrop.appendChild(modal);
                        document.body.appendChild(backdrop);

                        // wire basic buttons (listeners attached once)
            backdrop.querySelector('#apply-preview').addEventListener('click', () => {
                backdrop.classList.remove('show');
                // apply only to preview
        dbg('apply-preview clicked (modal) — applying to preview');
        applyChanges(false);
            });
                        backdrop.querySelector('#apply-all').addEventListener('click', async () => {
                            backdrop.classList.remove('show');
                            // apply to preview first then treat as selecting all
                            applyChanges(false);
                            const allIndexes = sideThumbsData.map((s, i) => i).filter(i => sideThumbsData[i] && sideThumbsData[i].src);
                            // when applying to all, we don't want to revert other images (they will be overwritten)
                            await processSelection(allIndexes, w, h, fmt, q, false);
                        });

                        // show-select toggles and will populate the list each time it's opened
                        const showSelectBtn = backdrop.querySelector('#show-select');
                        showSelectBtn.addEventListener('click', () => {
                                const thumbList = backdrop.querySelector('#apply-thumb-list');
                                // always rebuild the selection list so checked states reflect current applied sizes
                                thumbList.innerHTML = '';
                                sideThumbsData.forEach((it, i) => {
                                        const wrapper = document.createElement('label'); wrapper.className = 'sel-thumb';
                                        const cb = document.createElement('input'); cb.type = 'checkbox'; cb.dataset.idx = i;
                                        // Pre-check if this item is already applied to the chosen size
                                        try { cb.checked = !!(it.applied && it.appliedTo === `${w}×${h}`); } catch (e) {}
                                        const img = document.createElement('img'); img.src = it.src || ''; img.alt = it.name || 'thumb';
                                        const span = document.createElement('span'); span.textContent = it.name || `Gambar ${i+1}`;
                                        wrapper.appendChild(cb); wrapper.appendChild(img); wrapper.appendChild(span);
                                        thumbList.appendChild(wrapper);
                                });
                                const applySel = document.createElement('div'); applySel.style.display = 'flex'; applySel.style.gap = '8px'; applySel.style.marginTop = '8px';
                                const btnApplySelected = document.createElement('button'); btnApplySelected.className = 'apply-btn'; btnApplySelected.textContent = 'Terapkan ke yang Dipilih';
                                const btnCancelSel = document.createElement('button'); btnCancelSel.className = 'ghost'; btnCancelSel.textContent = 'Batal';
                                applySel.appendChild(btnCancelSel); applySel.appendChild(btnApplySelected);
                                thumbList.appendChild(applySel);

                                btnCancelSel.addEventListener('click', () => { thumbList.style.display = 'none'; });
                                btnApplySelected.addEventListener('click', async () => {
                                    const checked = Array.from(thumbList.querySelectorAll('input[type=checkbox]:checked')).map(n => parseInt(n.dataset.idx,10));
                                    backdrop.classList.remove('show');
                                    // Do not revert unselected items automatically — keep existing applied states unless user explicitly changes them
                                    await processSelection(checked, w, h, fmt, q, false);
                                });

                                thumbList.style.display = 'grid';
                        });
                        } else {
                                // modal exists (could be the static markup we added in HTML). Update the shown chosen size and populate thumbs.
                                // Update size display in static modal if present
                                const sizeDisplay = backdrop.querySelector('#apply-size-display') || backdrop.querySelector('.apply-modal .info');
                                if (sizeDisplay) sizeDisplay.textContent = `${w} × ${h}`;

                                // Determine thumb list container (support static id 'apply-modal-thumb-list' and dynamic 'apply-thumb-list')
                                const thumbListIdCandidates = ['#apply-modal-thumb-list', '#apply-thumb-list', '#apply-modal-thumb-list'];
                                let thumbList = null;
                                for (let i = 0; i < thumbListIdCandidates.length; i++) {
                                    const el = backdrop.querySelector(thumbListIdCandidates[i]);
                                    if (el) { thumbList = el; break; }
                                }

                                // Helper to populate thumbList with current sideThumbsData
                                function populateThumbList() {
                                    if (!thumbList) return;
                                    thumbList.innerHTML = '';
                                    if (!Array.isArray(sideThumbsData) || sideThumbsData.length === 0) {
                                        const empty = document.createElement('div'); empty.className = 'thumb-empty'; empty.textContent = 'Tidak ada gambar';
                                        thumbList.appendChild(empty);
                                        return;
                                    }
                                    // pagination: show up to SIDE_THUMBS_PAGE_SIZE items per page in the modal
                                    const PAGE_SIZE = typeof SIDE_THUMBS_PAGE_SIZE === 'number' ? SIDE_THUMBS_PAGE_SIZE : 10;
                                    if (typeof backdrop._applyThumbPage === 'undefined') backdrop._applyThumbPage = 0;
                                    const totalPages = Math.max(1, Math.ceil(sideThumbsData.length / PAGE_SIZE));
                                    // clamp page
                                    backdrop._applyThumbPage = Math.max(0, Math.min(backdrop._applyThumbPage, totalPages - 1));
                                    const start = backdrop._applyThumbPage * PAGE_SIZE;
                                    const slice = sideThumbsData.slice(start, start + PAGE_SIZE);

                                    // header with pagination info & nav
                                    const nav = document.createElement('div'); nav.style.display = 'flex'; nav.style.justifyContent = 'space-between'; nav.style.alignItems = 'center'; nav.style.marginBottom = '8px';
                                    const info = document.createElement('div'); info.style.fontSize = '0.9rem'; info.textContent = `Menampilkan ${start + 1}–${Math.min(start + slice.length, sideThumbsData.length)} dari ${sideThumbsData.length}`;
                                    const navBtns = document.createElement('div'); navBtns.style.display = 'flex'; navBtns.style.gap = '6px';
                                    const prev = document.createElement('button'); prev.className = 'ghost'; prev.textContent = '◀'; prev.disabled = backdrop._applyThumbPage <= 0;
                                    const next = document.createElement('button'); next.className = 'ghost'; next.textContent = '▶'; next.disabled = backdrop._applyThumbPage >= totalPages - 1;
                                    prev.addEventListener('click', (e) => { e.preventDefault(); backdrop._applyThumbPage = Math.max(0, backdrop._applyThumbPage - 1); populateThumbList(); });
                                    next.addEventListener('click', (e) => { e.preventDefault(); backdrop._applyThumbPage = Math.min(totalPages - 1, backdrop._applyThumbPage + 1); populateThumbList(); });
                                    navBtns.appendChild(prev); navBtns.appendChild(next);
                                    nav.appendChild(info); nav.appendChild(navBtns);
                                    thumbList.appendChild(nav);

                                    slice.forEach((it, localIdx) => {
                                        const globalIdx = start + localIdx;
                                        const wrapper = document.createElement('label'); wrapper.className = 'sel-thumb'; wrapper.style.display = 'flex'; wrapper.style.alignItems = 'center'; wrapper.style.gap = '8px'; wrapper.style.padding = '6px';
                                        const cb = document.createElement('input'); cb.type = 'checkbox'; cb.dataset.idx = globalIdx; cb.checked = !!(it.applied && it.appliedTo === `${w}×${h}`);
                                        const img = document.createElement('img'); img.src = it.src || ''; img.alt = it.name || `Gambar ${globalIdx+1}`; img.style.width = '56px'; img.style.height = '40px'; img.style.objectFit = 'cover'; img.style.borderRadius = '6px';
                                        const meta = document.createElement('div'); meta.style.flex = '1'; meta.innerHTML = `<div style="font-weight:600">${it.name || `Gambar ${globalIdx+1}`}</div><div style="font-size:0.85rem;color:#9aa4b2">${it.width ? it.width + ' × ' + (it.height || '-') : 'Dimensi tidak diketahui'}</div>`;
                                        wrapper.appendChild(cb); wrapper.appendChild(img); wrapper.appendChild(meta);
                                        thumbList.appendChild(wrapper);
                                    });
                                }

                                populateThumbList();

                                // Wire static modal action buttons if present (avoid double-binding)
                                if (!backdrop._applyActionsWired) {
                                    const previewBtn = backdrop.querySelector('#apply-to-preview');
                                    const allBtn = backdrop.querySelector('#apply-to-all');
                                    const selBtn = backdrop.querySelector('#apply-to-selected');

                                    if (previewBtn) previewBtn.addEventListener('click', (e) => { e.preventDefault(); closeApplyModal(); applyChanges(false); });
                                    if (allBtn) allBtn.addEventListener('click', async (e) => { e.preventDefault(); closeApplyModal(); applyChanges(false); const allIndexes = sideThumbsData.map((s, i) => i).filter(i => sideThumbsData[i] && sideThumbsData[i].src); await processSelection(allIndexes, w, h, fmt, q, false); });
                                    if (selBtn) selBtn.addEventListener('click', async (e) => { e.preventDefault(); if (!thumbList) { closeApplyModal(); return; } const checked = Array.from(thumbList.querySelectorAll('input[type=checkbox]:checked')).map(n => parseInt(n.dataset.idx, 10)); closeApplyModal(); await processSelection(checked, w, h, fmt, q, false); });
                                    backdrop._applyActionsWired = true;
                                }
                        }

                        // show it
                        backdrop.classList.add('show');
                        try { backdrop.setAttribute('aria-hidden', 'false'); } catch (e) {}
                        // ensure apply modal controls (close/X/backdrop/escape) wired
                        try { wireApplyModalControls(); } catch (e) {}
    }

    

    function resetEdit() {
        if (!originalImage) return showNotification('Tidak ada gambar untuk direset', 'error');

        // If we have a saved initialState (upload or recent), restore that snapshot.
        const snapshot = initialState;
        if (snapshot) { 
            lastCanvasDataURL = null; 
            if (imagePreview) { imagePreview.src = snapshot.src; imagePreview.style.display = 'block'; } 
            if (placeholder) placeholder.style.display = 'none'; 
 
            if (widthInput) widthInput.value = snapshot.width; 
            if (heightInput) heightInput.value = snapshot.height; 
            if (newDimensions) newDimensions.textContent = `${snapshot.width} × ${snapshot.height}`; 
 
            if (fileSize && snapshot.size) fileSize.textContent = formatFileSize(snapshot.size); 
            if (fileFormat && snapshot.type) fileFormat.textContent = (snapshot.type ? snapshot.type.split('/')[1] : 'image').toUpperCase(); 
 
            if (brightnessEl) { brightnessEl.value = snapshot.brightness; const bv = document.getElementById('brightness-value'); if (bv) bv.textContent = `${snapshot.brightness}%`; } 
            if (contrastEl) { contrastEl.value = snapshot.contrast; const cv = document.getElementById('contrast-value'); if (cv) cv.textContent = `${snapshot.contrast}%`; } 
            if (blurEl) { blurEl.value = snapshot.blur || 6; if (blurValueEl) blurValueEl.textContent = `${blurEl.value}px`; } 
            if (qualitySlider && qualityValue) { qualitySlider.value = snapshot.quality; qualityValue.textContent = `${snapshot.quality}%`; } 
 
            currentEffect = snapshot.effect || 'normal'; 
            document.querySelectorAll('.preset').forEach(p => p.classList.remove('active')); 
            // New markup uses data-effect="none" for the no-effect preset 
            const normalBtn = document.querySelector('.preset[data-effect="none"]') || document.querySelector('.preset[data-filter="normal"]'); 
            if (normalBtn) normalBtn.classList.add('active'); 

            // Also revert side thumbnails to their original state when resetting to snapshot
            if (Array.isArray(sideThumbsData) && sideThumbsData.length) {
                sideThumbsData.forEach(function (t) {
                    if (t.originalSrc) {
                        t.src = t.originalSrc;
                        t.width = t.originalWidth || t.width;
                        t.height = t.originalHeight || t.height;
                        t.size = t.originalSize || t.size;
                        t.applied = false;
                        t.appliedTo = null;
                    }
                });
                try { renderSideThumbs(sideThumbsPage); } catch (e) {}
            }
            // clear any preview->thumbnail mapping
            currentPreviewSideIndex = null;

            showNotification('Pengaturan dikembalikan ke kondisi saat gambar dipilih (termasuk thumbnail)'); 
            return; 
        } 

        // Fallback: restore to in-memory originalImage state
        lastCanvasDataURL = null;
        if (imagePreview) {
            imagePreview.src = originalImage.src;
            imagePreview.style.display = 'block';
        }
        if (placeholder) placeholder.style.display = 'none';
        if (widthInput) widthInput.value = originalWidth; if (heightInput) heightInput.value = originalHeight;
        if (newDimensions) newDimensions.textContent = `${originalWidth} × ${originalHeight}`;
        if (brightnessEl) { brightnessEl.value = 100; const bv = document.getElementById('brightness-value'); if (bv) bv.textContent = '100%'; }
        if (contrastEl) { contrastEl.value = 100; const cv = document.getElementById('contrast-value'); if (cv) cv.textContent = '100%'; }
    if (blurEl) { blurEl.value = 6; if (blurValueEl) blurValueEl.textContent = '6px'; }
        if (qualitySlider && qualityValue) { qualityValue.textContent = qualitySlider.value + '%'; }
    currentEffect = 'normal'; document.querySelectorAll('.preset').forEach(p => p.classList.remove('active'));
    const normalBtn2 = document.querySelector('.preset[data-effect="none"]') || document.querySelector('.preset[data-filter="normal"]'); if (normalBtn2) normalBtn2.classList.add('active');
    // Revert side thumbnails to original as part of reset fallback
    if (Array.isArray(sideThumbsData) && sideThumbsData.length) {
        sideThumbsData.forEach(function (t) {
            if (t.originalSrc) {
                t.src = t.originalSrc;
                t.width = t.originalWidth || t.width;
                t.height = t.originalHeight || t.height;
                t.size = t.originalSize || t.size;
                t.applied = false;
                t.appliedTo = null;
            }
        });
        try { renderSideThumbs(sideThumbsPage); } catch (e) {}
    }
    currentPreviewSideIndex = null;
    showNotification('Pengaturan dikembalikan ke kondisi saat gambar dipilih (termasuk thumbnail)');
    }

    function addToRecentImages(src, name) {
        if (!recentList) return;
        const item = document.createElement('div'); item.className = 'thumb';
        const img = document.createElement('img'); img.src = src; img.alt = name || 'thumb';
        item.appendChild(img);
            item.addEventListener('click', () => {
                originalImage = new Image(); originalImage.onload = function () {
                    originalWidth = this.width; originalHeight = this.height; aspectRatio = originalWidth / originalHeight;
                    if (originalDimensions) originalDimensions.textContent = `${originalWidth} × ${originalHeight}`;
                    if (widthInput) widthInput.value = originalWidth; if (heightInput) heightInput.value = originalHeight;
                    if (imagePreview) imagePreview.src = src;
                    if (placeholder) placeholder.style.display = 'none';
                    // Save snapshot for this recent image
                    initialState = {
                        src: src,
                        width: originalWidth,
                        height: originalHeight,
                        brightness: brightnessEl ? parseInt(brightnessEl.value) : 100,
                        contrast: contrastEl ? parseInt(contrastEl.value) : 100,
                        blur: blurEl ? parseInt(blurEl.value) : 6,
                        quality: qualitySlider ? parseInt(qualitySlider.value) : 80,
                        effect: 'normal',
                        name: name || 'image',
                        size: null,
                        type: null
                    };
                    showNotification('Gambar dimuat dari terbaru');
                };
                originalImage.src = src;
            });
        recentList.prepend(item);
        while (recentList.children.length > 6) recentList.removeChild(recentList.lastChild);
    }

    // Accept an item object: { src, name, width, height, size, type }
    // We also keep original* fields so applied/resets are possible later
    function addToSideThumbnails(item) {
        const side = document.getElementById('side-thumbs');
        if (!side) {
            // fallback
            try { addToRecentImages(item.src, item.name); } catch (e) {}
            return;
        }
        // Normalize and store metadata; preserve original values for potential revert
        const it = Object.assign({ src: '', name: 'image', width: null, height: null, size: null, type: null, originalSrc: null, originalWidth: null, originalHeight: null, originalSize: null, applied: false }, item || {});
        // If original fields not set, initialize them from the provided values
        if (!it.originalSrc) it.originalSrc = it.src;
        if (!it.originalWidth && it.width) it.originalWidth = it.width;
        if (!it.originalHeight && it.height) it.originalHeight = it.height;
        if (!it.originalSize && it.size) it.originalSize = it.size;
        sideThumbsData.push(it);
        // show the first page (1 / total) when new thumbnails are added so users see the
        // beginning of the list rather than jumping straight to the last page
        sideThumbsPage = 0;
        renderSideThumbs(sideThumbsPage);
    }

    function renderSideThumbs(page) {
        const side = document.getElementById('side-thumbs');
        if (!side) return;
        // clear
        side.innerHTML = '';
        // controls container
        const controls = document.createElement('div');
        controls.className = 'side-thumbs-controls';
        const totalPages = Math.max(1, Math.ceil(sideThumbsData.length / SIDE_THUMBS_PAGE_SIZE));
        const prev = document.createElement('button'); prev.className = 'thumb-nav'; prev.textContent = '◀';
        const next = document.createElement('button'); next.className = 'thumb-nav'; next.textContent = '▶';
        const info = document.createElement('div'); info.className = 'thumb-info'; info.textContent = `${(page||0)+1} / ${totalPages}`;
        prev.disabled = (page <= 0);
        next.disabled = (page >= totalPages - 1);
        prev.addEventListener('click', () => { sideThumbsPage = Math.max(0, sideThumbsPage - 1); renderSideThumbs(sideThumbsPage); });
        next.addEventListener('click', () => { sideThumbsPage = Math.min(totalPages - 1, sideThumbsPage + 1); renderSideThumbs(sideThumbsPage); });
        controls.appendChild(prev); controls.appendChild(info); controls.appendChild(next);
        side.appendChild(controls);

        if (sideThumbsData.length === 0) {
            const empty = document.createElement('div'); empty.className = 'thumb-empty'; empty.textContent = 'Tidak ada gambar tambahan';
            side.appendChild(empty);
            return;
        }

        const start = page * SIDE_THUMBS_PAGE_SIZE;
        const slice = sideThumbsData.slice(start, start + SIDE_THUMBS_PAGE_SIZE);
        slice.forEach((itemData, idx) => {
            const globalIndex = start + idx;
            const item = document.createElement('div'); item.className = 'thumb';
            const img = document.createElement('img'); img.src = itemData.src; img.alt = itemData.name || 'thumb';
            item.appendChild(img);

            // metadata block under each thumbnail: Dimensi, Baru, Ukuran, Format
            const meta = document.createElement('div'); meta.className = 'thumb-meta';
            const dimRow = document.createElement('div'); dimRow.className = 'meta-row';
            // Dimensi should show the ORIGINAL dimensions
            const origW = (typeof itemData.originalWidth !== 'undefined' && itemData.originalWidth) ? itemData.originalWidth : (itemData.width || null);
            const origH = (typeof itemData.originalHeight !== 'undefined' && itemData.originalHeight) ? itemData.originalHeight : (itemData.height || null);
            dimRow.innerHTML = `<strong>Dimensi:</strong> <span class="meta-dim">${origW ? origW + ' × ' + (origH || '-') : '-'}</span>`;
            const newRow = document.createElement('div'); newRow.className = 'meta-row';
            // Baru should reflect the applied size (if any)
            const baruText = itemData.applied ? `${itemData.width || '-'} × ${itemData.height || '-'}` : '';
            newRow.innerHTML = `<strong>Baru:</strong> <span class="meta-new">${baruText}</span>`;
            const sizeRow = document.createElement('div'); sizeRow.className = 'meta-row';
            sizeRow.innerHTML = `<strong>Ukuran:</strong> <span class="meta-size">${itemData.size ? formatFileSize(itemData.size) : '-'}</span>`;
            const fmtRow = document.createElement('div'); fmtRow.className = 'meta-row';
            fmtRow.innerHTML = `<strong>Format:</strong> <span class="meta-format">${itemData.type ? (itemData.type.split('/')[1] || itemData.type) : '-'}</span>`;
            meta.appendChild(dimRow); meta.appendChild(newRow); meta.appendChild(sizeRow); meta.appendChild(fmtRow);
            item.appendChild(meta);

            item.addEventListener('click', () => {
                try {
                    const currentPreviewSrc = (imagePreview && imagePreview.src) ? imagePreview.src : (initialState && initialState.src) ? initialState.src : null;
                    const clickedSrc = itemData.src;
                    // If clicked thumbnail already shown in preview, do nothing
                    if (currentPreviewSrc && clickedSrc && currentPreviewSrc === clickedSrc) return;

                    // Helper to load a source into preview and set initialState
                    // Load a source into the preview and update metadata.
                    // `meta` is optional and may contain: name, size, type, originalWidth, originalHeight, width, height, applied
                    function loadIntoPreview(src, meta = {}) {
                        originalImage = new Image();
                        originalImage.onload = function () {
                            // If metadata provides original dimensions (pre-apply), use them; otherwise use natural image size
                            const origW = (typeof meta.originalWidth !== 'undefined' && meta.originalWidth !== null) ? meta.originalWidth : this.width;
                            const origH = (typeof meta.originalHeight !== 'undefined' && meta.originalHeight !== null) ? meta.originalHeight : this.height;
                            originalWidth = origW; originalHeight = origH; aspectRatio = originalWidth / originalHeight;
                            if (originalDimensions) originalDimensions.textContent = `${originalWidth} × ${originalHeight}`;
                            // For width/height inputs, prefer applied size if provided, otherwise the original natural size
                            if (widthInput) widthInput.value = (typeof meta.width !== 'undefined' && meta.width !== null) ? meta.width : this.width;
                            if (heightInput) heightInput.value = (typeof meta.height !== 'undefined' && meta.height !== null) ? meta.height : this.height;
                            if (imagePreview) imagePreview.src = src;
                            if (placeholder) placeholder.style.display = 'none';
                            // newDimensions should show the applied (resized) size when available
                            if (newDimensions) {
                                if (meta.applied) {
                                    newDimensions.textContent = `${meta.width || '-'} × ${meta.height || '-'}`;
                                    lastAppliedWidth = meta.width || null; lastAppliedHeight = meta.height || null;
                                } else if (lastCanvasDataURL && lastAppliedWidth && lastAppliedHeight) {
                                    newDimensions.textContent = `${lastAppliedWidth} × ${lastAppliedHeight}`;
                                } else {
                                    newDimensions.textContent = `- × -`;
                                }
                            }
                            initialState = {
                                src: src,
                                width: originalWidth,
                                height: originalHeight,
                                brightness: brightnessEl ? parseInt(brightnessEl.value) : 100,
                                contrast: contrastEl ? parseInt(contrastEl.value) : 100,
                                blur: blurEl ? parseInt(blurEl.value) : 6,
                                quality: qualitySlider ? parseInt(qualitySlider.value) : 80,
                                effect: 'normal',
                                name: meta.name || 'image',
                                size: meta.size || null,
                                type: meta.type || null
                            };
                            renderSideThumbs(sideThumbsPage);
                            showNotification('Gambar dimuat');
                        };
                        originalImage.src = src;
                    }

                    // If the current preview is coming from a side thumbnail, swap sources between that thumbnail and the clicked one
                    if (typeof currentPreviewSideIndex === 'number' && sideThumbsData[currentPreviewSideIndex] && sideThumbsData[currentPreviewSideIndex].src === currentPreviewSrc) {
                        const prevIdx = currentPreviewSideIndex;
                        const a = sideThumbsData[prevIdx];
                        const b = sideThumbsData[globalIndex];
                            dbg('swapping side thumbnails', prevIdx, globalIndex);
                        // swap relevant fields so thumbnails exchange places
                        const fields = ['src','width','height','size','type','name','originalSrc','originalWidth','originalHeight','originalSize','applied','appliedTo'];
                        fields.forEach(f => { const tmp = a[f]; a[f] = b[f]; b[f] = tmp; });
                        // Now load the (new) b.src (which was previously at a) into preview — after swap, preview should correspond to globalIndex
                        currentPreviewSideIndex = globalIndex;
                        // pass the whole metadata object so loadIntoPreview can show original vs applied correctly
                            dbg('after swap, loading into preview index', currentPreviewSideIndex, sideThumbsData[currentPreviewSideIndex]);
                        loadIntoPreview(sideThumbsData[currentPreviewSideIndex].src, sideThumbsData[currentPreviewSideIndex]);
                        return;
                    }

                    // If preview is not from side thumbnails (e.g., uploaded main image), move the preview into the clicked thumbnail slot and load clicked into preview
                    if (currentPreviewSrc) {
                        // Save preview meta — keep original (pre-apply) dimensions and store applied size if available
                        const previewMeta = {
                            src: currentPreviewSrc,
                            name: (initialState && initialState.name) ? initialState.name : (currentFile && currentFile.name) ? currentFile.name : 'image',
                            // original dimensions should reflect originalWidth/Height (before any apply)
                            originalWidth: (typeof originalWidth !== 'undefined' ? originalWidth : (initialState && initialState.width) || null),
                            originalHeight: (typeof originalHeight !== 'undefined' ? originalHeight : (initialState && initialState.height) || null),
                            // applied (new) dimensions come from lastAppliedWidth/Height when we produced lastCanvasDataURL
                            width: (lastCanvasDataURL ? (lastAppliedWidth || originalWidth) : (initialState && initialState.width) || originalWidth),
                            height: (lastCanvasDataURL ? (lastAppliedHeight || originalHeight) : (initialState && initialState.height) || originalHeight),
                            size: (initialState && initialState.size) ? initialState.size : estimateDataURLSize(currentPreviewSrc),
                            type: (initialState && initialState.type) ? initialState.type : (currentFile && currentFile.type) ? currentFile.type : null,
                            originalSrc: currentPreviewSrc,
                            originalSize: (initialState && initialState.size) ? initialState.size : null,
                            applied: !!lastCanvasDataURL,
                            appliedTo: lastCanvasDataURL ? `${lastAppliedWidth}×${lastAppliedHeight}` : null
                        };
                        // Defensive: ensure previewMeta.src exists (fallbacks) so we don't store undefined entries
                        if (!previewMeta.src) previewMeta.src = previewMeta.originalSrc || (initialState && initialState.src) || (imagePreview && imagePreview.src) || '';
                        // Ensure clicked thumbnail has a valid src to load into preview
                        if (!itemData || !itemData.src) {
                            if (itemData && itemData.originalSrc) itemData.src = itemData.originalSrc;
                            else {
                                // nothing to load into preview -- abort swap to avoid hiding images
                                showNotification('Gagal memuat gambar tujuan (sumber tidak ditemukan)', 'error');
                                return;
                            }
                        }
                        // Replace clicked thumbnail slot with previewMeta (so previous preview moves to sidebar)
                        dbg('moving preview into sidebar slot', globalIndex, previewMeta);
                        sideThumbsData[globalIndex] = Object.assign({}, previewMeta);
                        // Load the clicked thumbnail into preview (pass its metadata so dimensions display correctly)
                        currentPreviewSideIndex = globalIndex;
                        loadIntoPreview(itemData.src, itemData);
                        return;
                    }

                    // Fallback: just load clicked thumbnail into preview
                    currentPreviewSideIndex = globalIndex;
                    loadIntoPreview(itemData.src, itemData);
                } catch (e) {
                    // fallback simple load using loadIntoPreview to ensure consistent metadata handling
                    currentPreviewSideIndex = globalIndex;
                    loadIntoPreview(itemData.src, itemData);
                    return;
                }
            });
            // visually mark selected thumbnail if it's currently previewed
            if (typeof currentPreviewSideIndex === 'number' && currentPreviewSideIndex === globalIndex) {
                item.classList.add('selected-thumb');
            }
            side.appendChild(item);
        });
    }

    // Move the side-thumbs container to left or right target. Persist choice in localStorage.
    function setSideThumbsPosition(pos) {
        const side = document.getElementById('side-thumbs');
        const leftTarget = document.getElementById('side-thumbs-target');
        const rightSidebar = document.querySelector('.sidebar.right');
        const toggle = document.getElementById('thumbs-pos-toggle');
        if (!side) return;
        if (pos === 'left' && leftTarget) {
            leftTarget.setAttribute('aria-hidden','false');
            leftTarget.appendChild(side);
        } else if (pos === 'right' && rightSidebar) {
            // insert near top of right sidebar
            rightSidebar.insertBefore(side, rightSidebar.firstElementChild);
        }
        try { localStorage.setItem('sideThumbsPos', pos); } catch (e) {}
        if (toggle) {
            toggle.setAttribute('aria-pressed', pos === 'left' ? 'true' : 'false');
            toggle.textContent = pos === 'left' ? 'Thumbs: L' : 'Thumbs: R';
        }
    }

    // wire toggle button in header
    (function wireThumbsToggle(){
        const toggle = document.getElementById('thumbs-pos-toggle');
        if (!toggle) return;
        // read stored preference
        const pref = (function(){ try { return localStorage.getItem('sideThumbsPos'); } catch (e) { return null; } })() || 'right';
        setSideThumbsPosition(pref);
        toggle.addEventListener('click', () => {
            const cur = (toggle.getAttribute('aria-pressed') === 'true') ? 'left' : 'right';
            const next = cur === 'left' ? 'right' : 'left';
            setSideThumbsPosition(next);
        });
    })();

    // wire simple slider live updates (brightness, contrast, blur)
    ['brightness','contrast','blur'].forEach(id => {
        const el = document.getElementById(id === 'blur' ? 'blur-radius' : id);
        const valEl = document.getElementById(id === 'blur' ? 'blur-value' : `${id}-value`);
        if (!el) return;
        el.addEventListener('input', () => {
            if (valEl) valEl.textContent = id === 'blur' ? `${el.value}px` : `${el.value}%`;
            // live slider updates should only affect preview, not side thumbnails
            applyChanges(false);
        });
    });

    // Background size quick-select buttons (.bg-size)
    // Clicking a size sets the width/height inputs, updates the preview dimension text,
    // toggles aria-pressed/active state and shows a small notification.
    (function wireBgSizes() {
        const bgBtns = document.querySelectorAll('.bg-size');
        if (!bgBtns || !bgBtns.length) return;
        bgBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                const size = btn.dataset.size || btn.getAttribute('data-size') || '';
                const parts = size.split('x').map(s => s.trim());
                if (parts.length === 2) {
                    const w = parseInt(parts[0], 10) || (widthInput ? parseInt(widthInput.value, 10) : originalWidth);
                    const h = parseInt(parts[1], 10) || (heightInput ? parseInt(heightInput.value, 10) : originalHeight);
                    if (widthInput) widthInput.value = w;
                    if (heightInput) heightInput.value = h;
                    if (newDimensions) newDimensions.textContent = `${w} × ${h}`;

                    // manage visual/ARIA state
                    bgBtns.forEach(b => {
                        b.classList.remove('active');
                        try { b.setAttribute('aria-pressed', 'false'); } catch (e) {}
                    });
                    btn.classList.add('active');
                    try { btn.setAttribute('aria-pressed', 'true'); } catch (e) {}

                    showNotification(`Ukuran diatur ke ${w} × ${h}`);
                    // Auto-apply chosen background size directly to the current preview.
                    // This makes workflow: (1) click thumbnail to preview, (2) click size -> applied immediately.
                    try {
                        if (originalImage) {
                            dbg('bg-size clicked -> auto-applying to preview', w, h);
                            applyChanges(false);
                        } else {
                            // No preview loaded; do not open modal — just notify user to load an image first.
                            // Keep this silent or minimal to avoid noisy alerts; using notification for clarity.
                            showNotification('Muat gambar terlebih dahulu untuk menerapkan ukuran', 'error');
                        }
                    } catch (e) { console.warn('[debug] auto-apply failed', e); }
                }
            });
        });
    })();

    // Collapsible 'Ukuran Background' — toggle sizes list when header is activated
    (function wireSizesToggle() {
        const sizesTitle = document.getElementById('sizes-title');
        if (!sizesTitle) return;
        // ensure keyboard/aria interactivity
        sizesTitle.setAttribute('role', 'button');
        sizesTitle.setAttribute('tabindex', '0');
        sizesTitle.setAttribute('aria-expanded', 'false');
        const sizesCard = sizesTitle.closest('.sizes-card');
        if (!sizesCard) return;
        // start closed
        sizesCard.classList.remove('open');

        function toggleSizes() {
            const opening = sizesCard.classList.toggle('open');
            sizesTitle.setAttribute('aria-expanded', opening ? 'true' : 'false');
        }

        sizesTitle.addEventListener('click', toggleSizes);
        sizesTitle.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleSizes(); }
        });
    })();

    // Generic collapsible toggles for headers with .collapsible-toggle
    (function wireGenericCollapsibles(){
        const toggles = document.querySelectorAll('.collapsible-toggle');
        if (!toggles || !toggles.length) return;
        toggles.forEach(t => {
            // Try to find the content to toggle. Many toggles in this app live
            // either as a sibling (e.g. h3 + .quick-presets) or the header is
            // inside a .card-header (h2) while the content lives after the
            // .card-header. Handle both cases robustly.
            let content = t.nextElementSibling;
            const parentSection = t.closest('section.card');
            if (!content && parentSection) {
                // prefer common content containers by class
                content = parentSection.querySelector('.quick-presets, .filter-presets, .control-row, .background-sizes');
            }
            if (!content) return;
            // ensure initial aria state
            t.setAttribute('aria-expanded', 'false');
            // click/keyboard handlers
            function toggle(){
                const isOpen = t.getAttribute('aria-expanded') === 'true';
                if (content.classList.contains('quick-presets') || content.classList.contains('filter-presets') || content.classList.contains('background-sizes')){
                    // simple show/hide for preset grids / sizes
                    content.classList.toggle('hidden-collapsible');
                    t.setAttribute('aria-expanded', isOpen ? 'false' : 'true');
                } else {
                    // if this toggle belongs to a section header for controls, toggle collapsed on parent card
                    if (parentSection && parentSection.classList.contains('compact')){
                        parentSection.classList.toggle('collapsed');
                        // when collapsed present => collapsed state, so aria-expanded should be false
                        const expanded = parentSection.classList.contains('collapsed') ? 'false' : 'true';
                        t.setAttribute('aria-expanded', expanded);
                    }
                }
            }
            t.addEventListener('click', toggle);
            t.addEventListener('keydown', (e)=>{
                if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); }
            });
        });
    })();

    // init visuals
    if (qualityValue && qualitySlider) qualityValue.textContent = qualitySlider.value + '%';
    if (newDimensions && widthInput && heightInput) newDimensions.textContent = `${widthInput.value || '-'} × ${heightInput.value || '-'}`;

    // Basic wiring for upload and controls
    (function wireControls() {
        if (fileInput) {
            fileInput.addEventListener('change', handleImageUpload);
            // allow keyboard activation on the label/upload area
        }
        if (uploadArea) {
            uploadArea.addEventListener('click', (e) => {
                try { if (fileInput) fileInput.click(); } catch (err) {}
            });
            uploadArea.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (fileInput) fileInput.click(); }
            });
            // drag/drop support
            uploadArea.addEventListener('dragover', (e) => { e.preventDefault(); uploadArea.classList.add('dragover'); });
            uploadArea.addEventListener('dragleave', (e) => { try { uploadArea.classList.remove('dragover'); } catch (err) {} });
            uploadArea.addEventListener('drop', (e) => {
                e.preventDefault(); try { uploadArea.classList.remove('dragover'); } catch (err) {}
                const dt = e.dataTransfer; if (!dt) return; const files = Array.from(dt.files || []);
                if (!files || !files.length) return;
                // assign files to the file input if possible, else call handler manually
                try {
                    if (fileInput) {
                        // create a DataTransfer if supported
                        try {
                            const dataTransfer = new DataTransfer();
                            files.forEach(f => dataTransfer.items.add(f));
                            fileInput.files = dataTransfer.files;
                            handleImageUpload();
                        } catch (err) {
                            // fallback: call handleImageUpload after reading files via FileReader
                            fileInput.files = files;
                            handleImageUpload();
                        }
                    }
                } catch (err) {}
            });
        }

    if (applyBtn) applyBtn.addEventListener('click', showApplyModal);
    if (downloadBtn) downloadBtn.addEventListener('click', showDownloadModal);
        if (resetBtn) resetBtn.addEventListener('click', resetEdit);
        if (widthInput) widthInput.addEventListener('input', handleSizeInput);
        if (heightInput) heightInput.addEventListener('input', handleSizeInput);
        if (qualitySlider && qualityValue) qualitySlider.addEventListener('input', () => { qualityValue.textContent = qualitySlider.value + '%'; });

        // Insert quick 'Terapkan Langsung' button and debug toggle into the preview actions
        try {
            const canvasActions = document.querySelector('.canvas-actions');
            if (canvasActions) {
                // Quick apply direct button
                if (!document.getElementById('apply-direct-btn')) {
                    const applyDirectBtn = document.createElement('button');
                    applyDirectBtn.className = 'btn small';
                    applyDirectBtn.id = 'apply-direct-btn';
                    applyDirectBtn.innerHTML = '<i class="fas fa-bolt"></i> Terapkan Langsung';
                    // Insert after applyBtn (if exists) otherwise append
                    if (applyBtn && applyBtn.parentNode === canvasActions) canvasActions.insertBefore(applyDirectBtn, applyBtn.nextSibling);
                    else canvasActions.appendChild(applyDirectBtn);
                    applyDirectBtn.addEventListener('click', (e) => {
                        e.preventDefault();
                        if (!originalImage) { showNotification('Muat gambar terlebih dahulu', 'error'); return; }
                        dbg('apply-direct button clicked');
                        applyChanges(false);
                    });
                }

                // debug toggle removed
            }
        } catch (err) { /* non-fatal */ }
    })();

    // Ensure apply modal close/escape/backdrop behaviors are wired (idempotent)
    let _applyModalWired = false;
    function closeApplyModal() {
        const bd = document.getElementById('apply-modal-backdrop');
        if (!bd) return;
        bd.classList.remove('show');
        try { bd.setAttribute('aria-hidden', 'true'); } catch (e) {}
        try { if (applyBtn) applyBtn.focus(); } catch (e) {}
    }

    function wireApplyModalControls() {
        if (_applyModalWired) return; // already wired
        const bd = document.getElementById('apply-modal-backdrop');
        if (!bd) return;
    // Close button (X) in header
    const closeBtn = bd.querySelector('#apply-modal-close');
    if (closeBtn) closeBtn.addEventListener('click', (e) => { e.preventDefault(); closeApplyModal(); });
        // Clicking the backdrop (outside modal) should close
        bd.addEventListener('click', (e) => { if (e.target === bd) closeApplyModal(); });
        // Escape key closes modal when shown
        document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { const b = document.getElementById('apply-modal-backdrop'); if (b && b.classList.contains('show')) closeApplyModal(); } });
        _applyModalWired = true;
    }

    // Try wiring immediately in case static modal exists, and also wire again when modal is created by showApplyModal
    try { wireApplyModalControls(); } catch (e) {}

    // Top navigation wiring: smooth-scroll to sections and set active state
    (function wireTopNav(){
        const navLinks = document.querySelectorAll('.top-actions .nav-link');
        if (!navLinks || !navLinks.length) return;

        function clearActive(){
            navLinks.forEach(l => l.classList.remove('active'));
        }

        navLinks.forEach(link => {
            // support both href anchors and data-target. If the link points to an external
            // page (not a '#id' anchor), allow normal navigation.
            const href = link.getAttribute('href') || '';
            const targetId = (link.dataset && link.dataset.target) ? link.dataset.target : (href.startsWith('#') ? href.replace('#','') : '');
            link.addEventListener('click', (e) => {
                // If this is an external link (doesn't start with '#') and no data-target, navigate normally
                if (href && !href.startsWith('#') && !targetId) {
                    return; // default browser navigation
                }
                e.preventDefault();
                const target = document.getElementById(targetId);
                if (target) {
                    // smooth scroll and focus for accessibility
                    try { target.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (err) { target.scrollIntoView(); }
                    setTimeout(() => { try { target.setAttribute('tabindex','-1'); target.focus({preventScroll:true}); } catch (err) {} }, 420);
                } else if (href && !href.startsWith('#')) {
                    // fallback: navigate to the href (external page)
                    window.location.href = href;
                }
                clearActive();
                link.classList.add('active');
            });
        });
        // Optionally, mark the first nav link as active on load
        // navLinks[0].classList.add('active');
    })();
});
