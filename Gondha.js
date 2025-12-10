document.addEventListener('DOMContentLoaded', () => {
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
    const downloadExportBtn = document.getElementById('download-export-btn');
    const originalDimensions = document.getElementById('original-dimensions');
    const newDimensions = document.getElementById('new-dimensions');
    const fileSize = document.getElementById('file-size');
    const fileFormat = document.getElementById('file-format');
    const previewContainer = document.getElementById('preview-container');
    const notification = document.getElementById('notification');
    const brightnessEl = document.getElementById('brightness');
    const contrastEl = document.getElementById('contrast');
    const blurEl = document.getElementById('blur-radius');
    const blurValueEl = document.getElementById('blur-value');

    let originalImage = null; 
    let lastCanvasDataURL = null; 
    let lastAppliedWidth = null; let lastAppliedHeight = null; 
    let originalWidth = 0; let originalHeight = 0; let aspectRatio = 1;
    let currentFile = null;
    let currentEffect = 'normal';
    let initialState = null;
    let sideThumbsData = [];
    let sideThumbsPage = 0;
    let currentPreviewSideIndex = null;
    const SIDE_THUMBS_PAGE_SIZE = 10;

    function setLoading(on) {
        if (!previewContainer) return;
        previewContainer.style.opacity = on ? '0.6' : '1';
        previewContainer.style.pointerEvents = on ? 'none' : '';
    }

    function formatFileSize(bytes) {
        if (!bytes && bytes !== 0) return '-';
        const k = 1024; const sizes = ['B','KB','MB','GB'];
        let i = 0; let val = bytes;
        while (val >= k && i < sizes.length - 1) { val = val / k; i++; }
        return `${val.toFixed(2)} ${sizes[i]}`;
    }

    function dbg() {  }

    function showNotification(text, type = 'success') {
        try {
            if (!notification) return;
            const textEl = document.getElementById('notification-text');
            if (textEl) textEl.textContent = text;
            notification.classList.remove('error');
            notification.classList.remove('show');
            if (type === 'error') notification.classList.add('error');
            setTimeout(() => notification.classList.add('show'), 10);
            setTimeout(() => notification.classList.remove('show'), 3000);
        } catch (e) {  }
    }
    (function wirePresets(){
        const presets = document.querySelectorAll('.preset');
        if (!presets || !presets.length) return;
        presets.forEach(p => p.addEventListener('click', function(){
            presets.forEach(pp => {
                pp.classList.remove('active');
                try { pp.setAttribute('aria-pressed', 'false'); } catch (e) {}
            });
            this.classList.add('active');
            try { this.setAttribute('aria-pressed', 'true'); } catch (e) {}
            const effRaw = this.dataset.effect || this.dataset.filter || 'none';
            currentEffect = effRaw === 'none' ? 'normal' : effRaw;
            if (brightnessEl) brightnessEl.value = 100;
            if (contrastEl) contrastEl.value = currentEffect === 'sharpen' ? 120 : 100;
            if (blurEl && currentEffect === 'blur') blurEl.value = 6;
            applyChanges(false);
        }));
    })();

    function resetEdit() {
        try {
            if (initialState) {
                lastCanvasDataURL = null;
                if (imagePreview) imagePreview.src = initialState.src || '';
                if (widthInput) widthInput.value = initialState.width || originalWidth || '';
                if (heightInput) heightInput.value = initialState.height || originalHeight || '';
                if (newDimensions) newDimensions.textContent = `- × -`;
                if (brightnessEl) brightnessEl.value = initialState.brightness || 100;
                if (contrastEl) contrastEl.value = initialState.contrast || 100;
                if (blurEl) blurEl.value = initialState.blur || 6;
                if (qualitySlider) qualitySlider.value = initialState.quality || 80;
                if (qualityValue) qualityValue.textContent = (qualitySlider ? qualitySlider.value : (initialState.quality || 80)) + '%';
                currentEffect = initialState.effect || 'normal';
                document.querySelectorAll('.preset').forEach(p => p.classList.remove('active'));
                const normalBtn = document.querySelector('.preset[data-effect="none"]') || document.querySelector('.preset[data-filter="normal"]');
                if (normalBtn) normalBtn.classList.add('active');
                lastAppliedWidth = null; lastAppliedHeight = null;
                currentPreviewSideIndex = null;
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
                showNotification('Pengaturan dikembalikan ke kondisi saat gambar dipilih (termasuk thumbnail)');
                return;
            }
            if (originalImage) {
                lastCanvasDataURL = null;
                if (imagePreview) imagePreview.src = originalImage.src || '';
                if (placeholder) placeholder.style.display = 'none';
                if (widthInput) widthInput.value = originalWidth;
                if (heightInput) heightInput.value = originalHeight;
                if (newDimensions) newDimensions.textContent = `${originalWidth} × ${originalHeight}`;
                if (brightnessEl) brightnessEl.value = 100;
                if (contrastEl) contrastEl.value = 100;
                if (blurEl) blurEl.value = 6;
                if (qualitySlider) qualitySlider.value = qualitySlider.defaultValue || 80;
                if (qualityValue) qualityValue.textContent = (qualitySlider ? qualitySlider.value : '80') + '%';
                currentEffect = 'normal';
                document.querySelectorAll('.preset').forEach(p => p.classList.remove('active'));
                const normalBtn2 = document.querySelector('.preset[data-effect="none"]') || document.querySelector('.preset[data-filter="normal"]');
                if (normalBtn2) normalBtn2.classList.add('active');
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
                return;
            }
            showNotification('Tidak ada gambar untuk direset', 'error');
        } catch (e) {
            try { console.error('resetEdit error', e); } catch (err) {}
            showNotification('Gagal mereset pengaturan', 'error');
        }
    }

    function handleImageUpload() {
        if (!fileInput || !fileInput.files || !fileInput.files.length) return;
        setLoading(true);
        const files = Array.from(fileInput.files);
        files.forEach((f, idx) => {
            const reader = new FileReader();
            reader.onload = (ev) => {
                if (idx === 0) {
                    try {
                        const existingPreviewSrc = (imagePreview && imagePreview.src) ? imagePreview.src : null;
                        const newSrc = ev && ev.target ? ev.target.result : null;
                        if (existingPreviewSrc && existingPreviewSrc !== '' && existingPreviewSrc !== newSrc) {
                            const prevName = (initialState && initialState.name) ? initialState.name : (currentFile && currentFile.name) ? currentFile.name : 'image';
                            const prevWidth = (initialState && initialState.width) ? initialState.width : originalWidth || null;
                            const prevHeight = (initialState && initialState.height) ? initialState.height : originalHeight || null;
                            const prevSize = (initialState && initialState.size) ? initialState.size : estimateDataURLSize(existingPreviewSrc);
                            const prevType = (initialState && initialState.type) ? initialState.type : (currentFile && currentFile.type) ? currentFile.type : null;
                            try {
                                addToSideThumbnails({ src: existingPreviewSrc, name: prevName, width: prevWidth, height: prevHeight, size: prevSize, type: prevType });
                            } catch (e) { }
                        }
                    } catch (e) {}

                    currentFile = f;
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
                try {
                    if (idx === 0) {
                    } else if (document.getElementById('side-thumbs')) {
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
                    }
                } catch (e) {  }
            };
            reader.readAsDataURL(f);
        });

        if (files.length > 1) {
            setTimeout(() => {
                const side = document.getElementById('side-thumbs');
                if (side && side.children && side.children.length) {
                    try { side.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (e) { side.scrollIntoView(); }
                    showNotification(`${files.length} gambar ditambahkan di sebelah kanan Pratinjau`);
                    return;
                }
                showNotification(`${files.length} gambar ditambahkan`);
            }, 300);
        }
        try {
            setTimeout(() => {
                try { fileInput.blur(); } catch (e) {}
                try { fileInput.value = ''; } catch (e) {}
            }, 300);
        } catch (e) {}
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

                    let baseFilter = `brightness(${brightness}%) contrast(${contrast}%)`;

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

                    if (currentEffect === 'blur' && blurRadius > 0 && blurRadius <= 8) {
                        ctx.filter = `${baseFilter}${extra} blur(${blurRadius}px)`;
                        ctx.drawImage(originalImage, 0, 0, w, h);
                    } else {
                        ctx.filter = `${baseFilter}${extra}`;
                        ctx.drawImage(originalImage, 0, 0, w, h);
                    }

                    if (currentEffect === 'sharpen') {
                const imgData = ctx.getImageData(0, 0, w, h);
                const out = ctx.createImageData(w, h);
                const data = imgData.data, od = out.data;
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
                if (blurRadius > 8) {
                    const factor = Math.max(2, Math.min(16, Math.round(blurRadius / 3)));
                    const sw = Math.max(1, Math.round(w / factor));
                    const sh = Math.max(1, Math.round(h / factor));
                    const tmp = document.createElement('canvas'); tmp.width = sw; tmp.height = sh;
                    const tctx = tmp.getContext('2d');
                    const smallBlur = Math.max(1, Math.round(blurRadius / factor));
                    tctx.filter = `blur(${smallBlur}px)`;
                    tctx.drawImage(originalImage, 0, 0, sw, sh);
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
                        const imgd = ctx.getImageData(0, 0, w, h);
                        const d = imgd.data;
                        for (let i = 0; i < d.length; i += 4) {
                            d[i] = 255 - d[i];
                            d[i + 1] = 255 - d[i + 1];
                            d[i + 2] = 255 - d[i + 2];
                        }
                        ctx.putImageData(imgd, 0, 0);
                    } else if (currentEffect === 'noise') {
                        const intensity = 25; 
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
                    lastCanvasDataURL = canvas.toDataURL('image/png');
                } else {
                    lastCanvasDataURL = canvas.toDataURL(format, quality);
                }
            } catch (e) {
                lastCanvasDataURL = canvas.toDataURL('image/jpeg', quality);
            }
            if (imagePreview) { imagePreview.src = lastCanvasDataURL; imagePreview.style.display = 'block'; }
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
            } catch (e) {  }
            if (placeholder) placeholder.style.display = 'none';
            if (newDimensions) newDimensions.textContent = `${w} × ${h}`;
            lastAppliedWidth = w; lastAppliedHeight = h;
            dbg('applyChanges -> produced preview', { width: w, height: h, currentPreviewSideIndex: currentPreviewSideIndex });
            try {
                if (syncToThumbnail && currentPreviewSideIndex !== null && typeof currentPreviewSideIndex !== 'undefined' && sideThumbsData[currentPreviewSideIndex]) {
                    const ti = sideThumbsData[currentPreviewSideIndex];
                    if (!ti.originalSrc) ti.originalSrc = ti.src;
                    if (!ti.originalWidth && ti.width) ti.originalWidth = ti.width;
                    if (!ti.originalHeight && ti.height) ti.originalHeight = ti.height;
                    ti.src = lastCanvasDataURL;
                    try { ti.type = format || ti.type; } catch (e) {}
                    ti.width = w; ti.height = h;
                    const approx = estimateDataURLSize(lastCanvasDataURL);
                    ti.size = approx || ti.size;
                    ti.applied = true; ti.appliedTo = `${w}×${h}`;
                    try { renderSideThumbs(sideThumbsPage); } catch (e) {}
                }
            } catch (e) {  }
            setLoading(false);
            showNotification('Perubahan diterapkan');
                try {
                    if (currentEffect === 'vintage') {
                        drawNoise(ctx, w, h, 0.06);
                        drawVignette(ctx, w, h, 0.45);
                    } else if (currentEffect === 'slumber') {
                        ctx.save();
                        ctx.globalCompositeOperation = 'overlay';
                        ctx.fillStyle = 'rgba(255,192,203,0.06)';
                        ctx.fillRect(0, 0, w, h);
                        ctx.restore();
                    } else if (currentEffect === 'reyes') {
                        drawVignette(ctx, w, h, 0.25);
                    }
                } catch (e) {
                }
        }, 60);
    }

    function downloadImage() {
        const format = (formatSelect && formatSelect.value) ? formatSelect.value : 'image/jpeg';
        const quality = qualitySlider ? (qualitySlider.value / 100) : 0.9;

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


    function dataURLToBlob(dataURL) {
        if (!dataURL) return null;
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
        const decoded = decodeURIComponent(data);
        const arr = new Uint8Array(decoded.length);
        for (let i = 0; i < decoded.length; i++) arr[i] = decoded.charCodeAt(i);
        return new Blob([arr], { type: mime });
    }

    async function fetchSrcAsBlob(src) {
        if (!src) return null;
        try {
            if (src.startsWith('data:')) return dataURLToBlob(src);
            const r = await fetch(src, { mode: 'cors' });
            if (!r.ok) return null;
            return await r.blob();
        } catch (e) {
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

    function blobToDataURL(blob) {
        return new Promise((resolve, reject) => {
            if (!blob) return resolve(null);
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = () => resolve(null);
            try { reader.readAsDataURL(blob); } catch (e) { resolve(null); }
        });
    }

    function downloadBlob(blob, filename) {
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href = url; a.download = filename || 'image'; document.body.appendChild(a);
        a.click(); setTimeout(() => { try { URL.revokeObjectURL(url); a.remove(); } catch (e) {} }, 5000);
    }

    async function downloadListIndividually(list, chosenFmt, chosenQ) {
        if (!Array.isArray(list) || !list.length) return;
        for (let i = 0; i < list.length; i++) {
            const it = list[i];
            try {
                let w = (i === 0) ? (lastAppliedWidth || parseInt(widthInput.value) || null) : null;
                let h = (i === 0) ? (lastAppliedHeight || parseInt(heightInput.value) || null) : null;
                if (!w || !h) {
                    const meta = sideThumbsData[i - 1];
                    if (meta) { w = meta.width || meta.originalWidth || meta.naturalWidth || null; h = meta.height || meta.originalHeight || meta.naturalHeight || null; }
                }
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
            try {
                const blob2 = await fetchSrcAsBlob(it.src);
                if (blob2) downloadBlob(blob2, it.name || `image-${i+1}.png`);
            } catch (err2) { console.error('download individual fallback error', err2); }
        }
    }

    function showDownloadModal() {
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
                backdrop.classList.remove('show');
                try {
                    const chosenFmt = (formatSelect && formatSelect.value) ? formatSelect.value : 'image/jpeg';
                    const chosenQ = qualitySlider ? (qualitySlider.value / 100) : 0.9;
                    await downloadListIndividually(list, chosenFmt, chosenQ);
                } catch (err) { console.error('download individual error', err); }
            });

            backdrop.querySelector('#download-zip').addEventListener('click', async () => {
                backdrop.classList.remove('show');
                try {
                    const chosenFmt = (formatSelect && formatSelect.value) ? formatSelect.value : 'image/jpeg';
                    const chosenQ = qualitySlider ? (qualitySlider.value / 100) : 0.9;

                    if (typeof JSZip === 'undefined') {
                        try {
                            await new Promise((resolve, reject) => {
                                const src = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
                                if (document.querySelector(`script[src="${src}"]`)) {
                                    const existing = document.querySelector(`script[src="${src}"]`);
                                    existing.addEventListener('load', () => resolve());
                                    existing.addEventListener('error', () => reject(new Error('Failed to load JSZip')));
                                    return;
                                }
                                const s = document.createElement('script'); s.src = src; s.async = true;
                                s.onload = () => resolve();
                                s.onerror = () => reject(new Error('Failed to load JSZip'));
                                document.head.appendChild(s);
                            });
                        } catch (e) {
                            console.error('Failed to load JSZip dynamically', e);
                            showNotification('Gagal memuat JSZip — mulai mengunduh satu-per-satu', 'error');
                            try { await downloadListIndividually(list, chosenFmt, chosenQ); } catch (ee) { console.error('fallback individual download error', ee); }
                            return;
                        }
                    }

                    if (typeof JSZip === 'undefined') {
                        showNotification('JSZip tidak tersedia — mulai mengunduh satu-per-satu', 'error');
                        try { await downloadListIndividually(list, chosenFmt, chosenQ); } catch (e) { console.error('fallback individual download error', e); }
                        return;
                    }

                    const zip = new JSZip();
                    const folder = zip.folder('images') || zip;
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
                            console.warn('zip re-encode failed, falling back to original blob', err);
                        }
                        try {
                            const b = await fetchSrcAsBlob(it.src);
                            if (b) folder.file(it.name || `image-${i+1}.png`, b);
                        } catch (err2) { console.error('zip fallback fetch error', err2); }
                    }

                    try {
                        const zblob = await zip.generateAsync({ type: 'blob' });
                        downloadBlob(zblob, 'images.zip');
                    } catch (zipErr) {
                        console.error('zip generateAsync error', zipErr);
                        showNotification('Gagal membuat ZIP — mulai mengunduh satu-per-satu', 'error');
                        try { await downloadListIndividually(list, chosenFmt, chosenQ); } catch (ee) { console.error('fallback individual download after zip failure error', ee); }
                    }
                } catch (err) {
                    console.error('zip error', err);
                    showNotification('Gagal membuat ZIP — coba unduh satu-per-satu', 'error');
                    try { await downloadListIndividually(list, (formatSelect && formatSelect.value) ? formatSelect.value : 'image/jpeg', qualitySlider ? (qualitySlider.value / 100) : 0.9); } catch (e) { console.error('final fallback error', e); }
                }
            });
        }

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

    function paperSizeToMM(size) {
        const map = { a4: {w:210,h:297}, a3:{w:297,h:420}, a5:{w:148,h:210}, letter:{w:216,h:279}, legal:{w:216,h:356} };
        return map[size] || { w:210, h:297 };
    }

    async function buildExportHTML(formatOverride) {
        try {
            const fmt = formatOverride || (formatSelect && formatSelect.value) || 'application/pdf';
            const paper = (document.getElementById('paper-size') || {}).value || 'a4';
            const orientation = (document.querySelector('input[name="orientation"]:checked') || {}).value || 'portrait';
            const dpi = parseInt((document.getElementById('dpi') || {}).value, 10) || 300;
            const margin = parseInt((document.getElementById('margin') || {}).value, 10) || 10;

            const dims = paperSizeToMM(paper);
            let wmm = dims.w, hmm = dims.h;
            if (orientation === 'landscape') { const t = wmm; wmm = hmm; hmm = t; }

            const images = [];
            try {
                const main = (imagePreview && imagePreview.src) ? imagePreview.src : (initialState && initialState.src) ? initialState.src : null;
                if (main) images.push({ src: main, label: 'Pratinjau' });
            } catch (e) {}
            try {
                if (Array.isArray(sideThumbsData) && sideThumbsData.length) {
                    sideThumbsData.forEach((it, i) => {
                        try { if (it && it.src) images.push({ src: it.src, label: it.name || `Gambar ${i+1}` }); } catch (e) {}
                    });
                }
            } catch (e) {}

            if (!images.length) {
                const emptyHtml = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{background:#e9edf2;margin:0;padding:20px;font-family:Arial,Helvetica,sans-serif} .page{width:${wmm}mm;height:${hmm}mm;margin:0 auto;background:#fff;box-shadow:0 4px 18px rgba(2,6,23,0.25);position:relative;} .content{box-sizing:border-box;padding:${margin}mm;display:flex;align-items:center;justify-content:center;height:100%;color:#888}</style></head><body><div class="page"><div class="content">Tidak ada gambar untuk pratinjau</div></div></body></html>`;
                return emptyHtml;
            }

            const contentWmm = Math.max(1, wmm - (margin * 2));
            const contentHmm = Math.max(1, hmm - (margin * 2));
            const targetPxW = Math.max(1, Math.round((contentWmm * dpi) / 25.4));
            const targetPxH = Math.max(1, Math.round((contentHmm * dpi) / 25.4));

            const outFormat = 'image/jpeg';
            const q = (qualitySlider ? (qualitySlider.value / 100) : 0.9);

            const resizedImages = [];
            for (let i = 0; i < images.length; i++) {
                const it = images[i];
                try {

                    let baseSrc = it.src;
                    try {
                        const fetchedBlob = await fetchSrcAsBlob(it.src);
                        const embedded = await blobToDataURL(fetchedBlob);
                        if (embedded && typeof embedded === 'string' && embedded.indexOf('data:') === 0) {
                            baseSrc = embedded;
                        }
                    } catch (prefetchErr) {
                        console.warn('prefetch embed failed for', it.src, prefetchErr);
                    }

                    const img = new Image();
                    const loadSrc = baseSrc;
                    const meta = await new Promise((resolve) => {
                        img.onload = () => resolve({ w: img.naturalWidth || img.width || 0, h: img.naturalHeight || img.height || 0 });
                        img.onerror = () => resolve(null);
                        img.src = loadSrc;
                    });

                    let finalDataUrl = baseSrc;
                    if (meta) {
                        const srcW = meta.w || targetPxW;
                        const srcH = meta.h || targetPxH;
                        const scale = Math.min(targetPxW / srcW, targetPxH / srcH, 1);
                        const wpx = Math.max(1, Math.round(srcW * scale));
                        const hpx = Math.max(1, Math.round(srcH * scale));
                        try {
                            const r = await resizeDataURL(baseSrc, wpx, hpx, outFormat, q);
                            if (r && typeof r === 'string' && r.indexOf('data:') === 0) {
                                finalDataUrl = r;
                            } else {
                                try {
                                    const b = await fetchSrcAsBlob(baseSrc);
                                    const dr = await blobToDataURL(b);
                                    if (dr && dr.indexOf('data:') === 0) finalDataUrl = dr;
                                } catch (ee) {  }
                            }
                        } catch (e) {
                            try {
                                const b = await fetchSrcAsBlob(baseSrc);
                                const dr = await blobToDataURL(b);
                                if (dr && dr.indexOf('data:') === 0) finalDataUrl = dr;
                            } catch (ee) {  }
                        }
                    }
                    resizedImages.push({ src: finalDataUrl, label: it.label });
                } catch (e) {
                    console.warn('resizing/embedding failed for', it && it.src, e);
                    resizedImages.push({ src: it.src, label: it.label });
                }
            }

            let pagesHtml = '';
            for (let pi = 0; pi < resizedImages.length; pi++) {
                const img = resizedImages[pi];
                pagesHtml += `<div class="page" data-page="${pi+1}">`;
                pagesHtml += `<div class="content">${img && img.src ? `<img src="${img.src}" alt="${(img.label||'image').replace(/"/g,'') }"/>` : '<div style="color:#888">Tidak ada gambar</div>'}</div>`;
                pagesHtml += `<div class="meta">${(fmt.indexOf('word')!==-1 ? 'Word' : 'PDF')} • ${wmm}×${hmm} mm • Margin ${margin} mm • ${dpi} DPI • Halaman ${pi+1} / ${resizedImages.length}</div>`;
                pagesHtml += `</div>`;
            }

            const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>
                body{background:#e9edf2;margin:0;padding:20px;font-family:Arial,Helvetica,sans-serif}
                .page{width:${wmm}mm;height:${hmm}mm;margin:0 auto;background:#fff;box-shadow:0 4px 18px rgba(2,6,23,0.25);position:relative;margin-bottom:18px}
                .content{box-sizing:border-box;padding:${margin}mm;display:flex;align-items:center;justify-content:center;height:100%;}
                .content img{max-width:100%;max-height:100%;object-fit:contain;display:block}
                .meta{position:absolute;left:8px;bottom:6px;color:#666;font-size:11px}
            </style></head><body>${pagesHtml}</body></html>`;
            return html;
        } catch (e) { return '<html><body><div>Preview gagal dibuat</div></body></html>'; }
    }

    async function updateExportPreview(forceFormat) {
        try {
            const iframe = document.getElementById('export-preview-iframe');
            const label = document.getElementById('export-format-label');
            if (!iframe) return;
            const fmt = forceFormat || (formatSelect && formatSelect.value) || 'application/pdf';
            if (label) label.textContent = (fmt.indexOf('word')!==-1 ? 'Word' : 'PDF');
            const html = await buildExportHTML(fmt);
            try { iframe.srcdoc = html; } catch (e) { iframe.src = 'data:text/html;charset=utf-8,' + encodeURIComponent(html); }
            try {
                const parser = new DOMParser();
                const doc = parser.parseFromString(html, 'text/html');
                const firstImg = doc.querySelector('.page img');
                const firstSrc = firstImg ? firstImg.getAttribute('src') : null;
                positionExportPreviewForFirstImage(firstSrc);
            } catch (e) {}
        } catch (e) { console.error('updateExportPreview error', e); }
    }

    function positionExportPreviewForFirstImage(imgSrc) {
        try {
            const exportSection = document.getElementById('export-preview-section');
            if (!exportSection) return;
            const canvasArea = document.querySelector('.canvas-area');
            const editorRoot = document.querySelector('.editor');
            if (!canvasArea || !editorRoot) return;

            function moveToCanvasSide() {
                exportSection.classList.remove('full-row');
                exportSection.classList.add('export-side-by-side');
                const rightSidebar = document.querySelector('.sidebar.right');
                if (rightSidebar && rightSidebar.parentNode === editorRoot) {
                    if (rightSidebar.previousSibling !== exportSection) editorRoot.insertBefore(exportSection, rightSidebar);
                } else {
                    try { editorRoot.insertBefore(exportSection, canvasArea.nextSibling); } catch (e) { /* ignore */ }
                }
            }

            function moveToFullRow() {
                exportSection.classList.add('full-row');
                exportSection.classList.remove('export-side-by-side');
                const after = canvasArea.nextSibling;
                if (after !== exportSection) {
                    try { editorRoot.insertBefore(exportSection, canvasArea.nextSibling); } catch (e) { /* ignore */ }
                }
            }

            if (!imgSrc) {
                moveToFullRow();
                return;
            }

            const img = new Image();
            img.onload = function () {
                const w = img.naturalWidth || img.width || 0;
                const h = img.naturalHeight || img.height || 0;
                if (h > w) moveToCanvasSide(); else moveToFullRow();
            };
            img.onerror = function () { moveToFullRow(); };
            img.src = imgSrc;
        } catch (e) { console.error('positionExportPreviewForFirstImage error', e); }
    }

    try {
        const previewPdfBtn = document.getElementById('preview-pdf');
        const previewWordBtn = document.getElementById('preview-word');
        if (previewPdfBtn) previewPdfBtn.addEventListener('click', (e) => { e.preventDefault(); updateExportPreview('application/pdf'); });
        if (previewWordBtn) previewWordBtn.addEventListener('click', (e) => { e.preventDefault(); updateExportPreview('application/msword'); });
        if (formatSelect) formatSelect.addEventListener('change', () => updateExportPreview());
        const paperEl = document.getElementById('paper-size'); if (paperEl) paperEl.addEventListener('change', () => updateExportPreview());
        const orientEls = document.querySelectorAll('input[name="orientation"]'); orientEls.forEach(el => el.addEventListener('change', () => updateExportPreview()));
        const dpiEl = document.getElementById('dpi'); if (dpiEl) dpiEl.addEventListener('input', () => updateExportPreview());
        const marginEl = document.getElementById('margin'); if (marginEl) marginEl.addEventListener('input', () => updateExportPreview());
        if (imagePreview) imagePreview.addEventListener('load', () => updateExportPreview());
    } catch (e) {}


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

    function ensureHtml2PdfLoaded() {
        return new Promise((resolve, reject) => {
            if (typeof html2pdf !== 'undefined') return resolve();
            const src = 'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.9.3/html2pdf.bundle.min.js';
            const existing = document.querySelector(`script[src="${src}"]`);
            if (existing) {
                existing.addEventListener('load', () => resolve());
                existing.addEventListener('error', () => reject(new Error('Failed to load html2pdf')));
                return;
            }
            const s = document.createElement('script'); s.src = src; s.async = true;
            s.onload = () => resolve();
            s.onerror = () => reject(new Error('Failed to load html2pdf'));
            document.head.appendChild(s);
        });
    }

    async function downloadExportPreview() {
        try {
            const fmt = (formatSelect && formatSelect.value) ? formatSelect.value : 'application/pdf';
            const paper = (document.getElementById('paper-size') || {}).value || 'a4';
            const orientation = (document.querySelector('input[name="orientation"]:checked') || {}).value || 'portrait';
            const dpi = parseInt((document.getElementById('dpi') || {}).value, 10) || 300;
            const margin = parseInt((document.getElementById('margin') || {}).value, 10) || 10;

            const html = await buildExportHTML(fmt);

            if (fmt.indexOf('pdf') !== -1) {
                await ensureHtml2PdfLoaded();
                const wrap = document.createElement('div');
                wrap.style.position = 'fixed'; wrap.style.left = '-9999px'; wrap.style.top = '0';
                wrap.style.width = '1000px';
                wrap.innerHTML = html;
                document.body.appendChild(wrap);

                const dims = paperSizeToMM(paper);
                let wmm = dims.w, hmm = dims.h;
                if (orientation === 'landscape') { const t = wmm; wmm = hmm; hmm = t; }

                const filename = `export.${fmt.indexOf('word') !== -1 ? 'doc' : 'pdf'}`;
                const opt = {
                    margin: margin,
                    filename: filename,
                    image: { type: 'jpeg', quality: (qualitySlider ? (qualitySlider.value / 100) : 0.9) },
                    html2canvas: { scale: Math.min(2, window.devicePixelRatio || 1), useCORS: true, allowTaint: true },
                    jsPDF: { unit: 'mm', format: [wmm, hmm], orientation: orientation }
                };

                showNotification('Mempersiapkan ekspor PDF — menunggu gambar termuat...', 'success');
                await new Promise((res) => {
                    const imgs = Array.from(wrap.querySelectorAll('img'));
                    if (!imgs.length) return res();
                    let remaining = imgs.length;
                    function checkDone() { if (--remaining <= 0) res(); }
                    imgs.forEach((im) => {
                        if (im.complete && im.naturalWidth) return checkDone();
                        im.addEventListener('load', checkDone);
                        im.addEventListener('error', checkDone);
                    });
                    setTimeout(() => { try { console.warn('image wait timeout reached'); res(); } catch (e) { res(); } }, 10000);
                });

                await new Promise((resolve, reject) => {
                    try {
                        html2pdf().set(opt).from(wrap).save().then(() => { resolve(); }).catch((e) => { reject(e); });
                    } catch (e) { reject(e); }
                });

                try { wrap.remove(); } catch (e) {}
                return;
            }

            if (fmt.indexOf('word') !== -1 || fmt.indexOf('msword') !== -1) {
                const blob = new Blob([html], { type: 'application/msword' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a'); a.href = url; a.download = `export.doc`;
                document.body.appendChild(a); a.click(); a.remove();
                setTimeout(() => { try { URL.revokeObjectURL(url); } catch (e) {} }, 5000);
                return;
            }

            // fallback: save HTML
            const blob = new Blob([html], { type: 'text/html' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a'); a.href = url; a.download = 'export.html';
            document.body.appendChild(a); a.click(); a.remove();
            setTimeout(() => { try { URL.revokeObjectURL(url); } catch (e) {} }, 5000);
        } catch (e) {
            console.error('downloadExportPreview failed', e);
            showNotification('Gagal membuat unduhan pratinjau ekspor', 'error');
        }
    }

    function estimateDataURLSize(dataUrl) {
        if (!dataUrl) return null;
        const idx = dataUrl.indexOf(',');
        if (idx < 0) return null;
        const b64 = dataUrl.slice(idx + 1).replace(/\s/g, '');
        const padding = (b64.endsWith('==') ? 2 : (b64.endsWith('=') ? 1 : 0));
        return Math.floor((b64.length * 3) / 4) - padding;
    }

    async function applyToIndexes(indexes, w, h, fmt, q) {
        if (!indexes || !indexes.length) return;
        try { dbg('applyToIndexes -> indexes:', indexes, 'size:', w, 'x', h, 'fmt:', fmt, 'q:', q); } catch(e) {}
        setLoading(true);
        const toProcess = Array.from(indexes);
        for (let i = 0; i < toProcess.length; i++) {
            const idx = toProcess[i];
            const item = sideThumbsData[idx];
            if (!item || !item.src) continue;
            if (!item.originalSrc) { item.originalSrc = item.src; }
            if (!item.originalWidth && item.width) item.originalWidth = item.width;
            if (!item.originalHeight && item.height) item.originalHeight = item.height;
            if (!item.originalSize && item.size) item.originalSize = item.size;
            try {
                const newSrc = await resizeDataURL(item.src, w, h, fmt, q);
                item.src = newSrc;
                    try { item.type = fmt || item.type; } catch (e) {}
                item.width = w; item.height = h;
                const approx = estimateDataURLSize(newSrc);
                item.size = approx || item.size;
                item.applied = true;
                item.appliedTo = `${w}×${h}`;
            } catch (e) {
            }
        }
        renderSideThumbs(sideThumbsPage);
        setLoading(false);
        showNotification('Ukuran telah diterapkan ke gambar terpilih');
    }

    async function processSelection(checkedIndexes, w, h, fmt, q, revertUnselected = false) {
        setLoading(true);
        dbg('processSelection start', { checkedIndexes: checkedIndexes, target: `${w}x${h}`, revertUnselected });
        const checkedSet = new Set((checkedIndexes || []).map(n => parseInt(n, 10)));
        const toApply = [];
        const toRevert = [];
        for (let i = 0; i < sideThumbsData.length; i++) {
            const it = sideThumbsData[i];
            const isChecked = checkedSet.has(i);
            if (isChecked) {
                if (!(it.applied && it.appliedTo === `${w}×${h}`)) toApply.push(i);
            } else {
                if (revertUnselected && it.applied) toRevert.push(i);
            }
        }
        if (toApply.length) await applyToIndexes(toApply, w, h, fmt, q);
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

    function showApplyModal() {
        if (!widthInput || !heightInput) { applyChanges(); return; }
        const w = parseInt(widthInput.value) || originalWidth;
        const h = parseInt(heightInput.value) || originalHeight;
        const fmt = (formatSelect && formatSelect.value) ? formatSelect.value : 'image/jpeg';
        const q = qualitySlider ? (qualitySlider.value / 100) : 0.9;
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

            backdrop.querySelector('#apply-preview').addEventListener('click', () => {
                backdrop.classList.remove('show');
        dbg('apply-preview clicked (modal) — applying to preview');
        applyChanges(false);
            });
                        backdrop.querySelector('#apply-all').addEventListener('click', async () => {
                            backdrop.classList.remove('show');
                            applyChanges(false);
                            const allIndexes = sideThumbsData.map((s, i) => i).filter(i => sideThumbsData[i] && sideThumbsData[i].src);
                            await processSelection(allIndexes, w, h, fmt, q, false);
                        });

                        const showSelectBtn = backdrop.querySelector('#show-select');
                        showSelectBtn.addEventListener('click', () => {
                                const thumbList = backdrop.querySelector('#apply-thumb-list');
                                if (!thumbList) return;
                                const PER_PAGE = 10;
                                const totalPages = Math.max(1, Math.ceil(sideThumbsData.length / PER_PAGE));
                                let page = 0;
                                const selectedSet = new Set();
                                sideThumbsData.forEach((it, idx) => { try { if (it.applied && it.appliedTo === `${w}×${h}`) selectedSet.add(idx); } catch(e) {} });

                                function renderPage() {
                                    thumbList.innerHTML = '';
                                    const PER_PAGE = 10;
                                    const totalPages = Math.max(1, Math.ceil(sideThumbsData.length / PER_PAGE));
                                    page = Math.max(0, Math.min(page, totalPages - 1));
                                    const start = page * PER_PAGE;
                                    const slice = sideThumbsData.slice(start, start + PER_PAGE);
                                    const isMobile = (typeof window !== 'undefined' && (window.matchMedia && window.matchMedia('(max-width:720px)').matches));
                                    if (!isMobile) {
                                        const nav = document.createElement('div'); nav.className = 'apply-nav'; nav.setAttribute('role','navigation'); nav.style.display = 'flex'; nav.style.justifyContent = 'space-between'; nav.style.alignItems = 'center'; nav.style.marginBottom = '8px';
                                        const prev = document.createElement('button'); prev.className = 'ghost'; prev.textContent = '◀'; prev.disabled = page <= 0;
                                        const info = document.createElement('div'); info.style.color = 'var(--muted)'; info.style.fontWeight = '700'; info.textContent = `${page + 1} / ${totalPages}`;
                                        const next = document.createElement('button'); next.className = 'ghost'; next.textContent = '▶'; next.disabled = page >= totalPages - 1;
                                        prev.addEventListener('click', () => { page = Math.max(0, page - 1); renderPage(); });
                                        next.addEventListener('click', () => { page = Math.min(totalPages - 1, page + 1); renderPage(); });
                                        nav.appendChild(prev); nav.appendChild(info); nav.appendChild(next);
                                        thumbList.appendChild(nav);
                                    }
                                    if (isMobile) {
                                        if (sideThumbsData.length > PER_PAGE) {
                                            const vert = document.createElement('div'); vert.className = 'apply-thumb-vert';
                                            sideThumbsData.forEach((it, idx) => {
                                                const globalIndex = idx;
                                                const wrapper = document.createElement('label'); wrapper.className = 'sel-thumb'; wrapper.style.display = 'flex'; wrapper.style.alignItems = 'center'; wrapper.style.gap = '8px'; wrapper.style.padding = '6px';
                                                const cb = document.createElement('input'); cb.type = 'checkbox'; cb.dataset.idx = globalIndex;
                                                try { cb.checked = selectedSet.has(globalIndex) || !!(it.applied && it.appliedTo === `${w}×${h}`); } catch (e) {}
                                                cb.addEventListener('change', (ev) => { if (ev.target.checked) selectedSet.add(globalIndex); else selectedSet.delete(globalIndex); });
                                                const img = document.createElement('img'); img.src = it.src || ''; img.alt = it.name || 'thumb'; img.style.width = '64px'; img.style.height = '48px'; img.style.objectFit = 'cover'; img.style.borderRadius = '6px';
                                                const meta = document.createElement('div'); meta.style.flex = '1'; meta.innerHTML = `<div style="font-weight:600">${it.name || `Gambar ${globalIndex+1}`}</div><div style="font-size:0.85rem;color:#9aa4b2">${it.width ? it.width + ' × ' + (it.height || '-') : 'Dimensi tidak diketahui'}</div>`;
                                                wrapper.appendChild(cb); wrapper.appendChild(img); wrapper.appendChild(meta);
                                                vert.appendChild(wrapper);
                                            });
                                            thumbList.appendChild(vert);
                                        } else {
                                            const vert = document.createElement('div'); vert.className = 'apply-thumb-vert';
                                            slice.forEach((it, idx) => {
                                                const globalIndex = start + idx;
                                                const wrapper = document.createElement('label'); wrapper.className = 'sel-thumb'; wrapper.style.display = 'flex'; wrapper.style.alignItems = 'center'; wrapper.style.gap = '8px'; wrapper.style.padding = '6px';
                                                const cb = document.createElement('input'); cb.type = 'checkbox'; cb.dataset.idx = globalIndex;
                                                try { cb.checked = selectedSet.has(globalIndex) || !!(it.applied && it.appliedTo === `${w}×${h}`); } catch (e) {}
                                                cb.addEventListener('change', (ev) => { if (ev.target.checked) selectedSet.add(globalIndex); else selectedSet.delete(globalIndex); });
                                                const img = document.createElement('img'); img.src = it.src || ''; img.alt = it.name || 'thumb'; img.style.width = '56px'; img.style.height = '40px'; img.style.objectFit = 'cover'; img.style.borderRadius = '6px';
                                                const meta = document.createElement('div'); meta.style.flex = '1'; meta.innerHTML = `<div style="font-weight:600">${it.name || `Gambar ${globalIndex+1}`}</div><div style="font-size:0.85rem;color:#9aa4b2">${it.width ? it.width + ' × ' + (it.height || '-') : 'Dimensi tidak diketahui'}</div>`;
                                                wrapper.appendChild(cb); wrapper.appendChild(img); wrapper.appendChild(meta);
                                                vert.appendChild(wrapper);
                                            });
                                            thumbList.appendChild(vert);
                                        }
                                    } else {
                                        slice.forEach((it, idx) => {
                                            const globalIndex = start + idx;
                                            const wrapper = document.createElement('label'); wrapper.className = 'sel-thumb'; wrapper.style.display = 'flex'; wrapper.style.alignItems = 'center'; wrapper.style.gap = '8px'; wrapper.style.padding = '6px';
                                            const cb = document.createElement('input'); cb.type = 'checkbox'; cb.dataset.idx = globalIndex;
                                            try { cb.checked = selectedSet.has(globalIndex) || !!(it.applied && it.appliedTo === `${w}×${h}`); } catch (e) {}
                                            cb.addEventListener('change', (ev) => {
                                                if (ev.target.checked) selectedSet.add(globalIndex); else selectedSet.delete(globalIndex);
                                            });
                                            const img = document.createElement('img'); img.src = it.src || ''; img.alt = it.name || 'thumb'; img.style.width = '56px'; img.style.height = '40px'; img.style.objectFit = 'cover'; img.style.borderRadius = '6px';
                                            const span = document.createElement('span'); span.textContent = it.name || `Gambar ${globalIndex + 1}`;
                                            wrapper.appendChild(cb); wrapper.appendChild(img); wrapper.appendChild(span);
                                            thumbList.appendChild(wrapper);
                                        });
                                    }

                                    const applySel = document.createElement('div'); applySel.style.display = 'flex'; applySel.style.gap = '8px'; applySel.style.marginTop = '8px'; applySel.style.justifyContent = 'flex-end';
                                    const btnCancelSel = document.createElement('button'); btnCancelSel.className = 'ghost'; btnCancelSel.textContent = 'Batal';
                                    const btnApplySelected = document.createElement('button'); btnApplySelected.className = 'apply-btn'; btnApplySelected.textContent = 'Terapkan ke yang Dipilih';
                                    applySel.appendChild(btnCancelSel); applySel.appendChild(btnApplySelected);
                                    thumbList.appendChild(applySel);

                                    btnCancelSel.addEventListener('click', () => { thumbList.style.display = 'none'; });
                                    btnApplySelected.addEventListener('click', async () => {
                                        const checked = Array.from(selectedSet.values());
                                        backdrop.classList.remove('show');
                                        await processSelection(checked, w, h, fmt, q, false);
                                    });
                                }

                                renderPage();
                                thumbList.style.display = 'grid';
                        });
                        } else {
                                const sizeDisplay = backdrop.querySelector('#apply-size-display') || backdrop.querySelector('.apply-modal .info');
                                if (sizeDisplay) sizeDisplay.textContent = `${w} × ${h}`;

                                const thumbListIdCandidates = ['#apply-modal-thumb-list', '#apply-thumb-list', '#apply-modal-thumb-list'];
                                let thumbList = null;
                                for (let i = 0; i < thumbListIdCandidates.length; i++) {
                                    const el = backdrop.querySelector(thumbListIdCandidates[i]);
                                    if (el) { thumbList = el; break; }
                                }

                                function populateThumbList() {
                                    if (!thumbList) return;
                                    const PER_PAGE = 10;
                                    const totalPages = Math.max(1, Math.ceil(sideThumbsData.length / PER_PAGE));
                                    let page = backdrop._applyThumbPage || 0;

                                    function render() {
                                        thumbList.innerHTML = '';
                                        const PER_PAGE = 10;
                                        const totalPages = Math.max(1, Math.ceil(sideThumbsData.length / PER_PAGE));
                                        page = Math.max(0, Math.min(page, totalPages - 1));
                                        const start = page * PER_PAGE;
                                        const slice = sideThumbsData.slice(start, start + PER_PAGE);
                                        const isMobile = (typeof window !== 'undefined' && (window.matchMedia && window.matchMedia('(max-width:720px)').matches));
                                        if (!isMobile) {
                                            const nav = document.createElement('div'); nav.className = 'apply-nav'; nav.setAttribute('role','navigation'); nav.style.display = 'flex'; nav.style.justifyContent = 'space-between'; nav.style.alignItems = 'center'; nav.style.marginBottom = '8px';
                                            const prev = document.createElement('button'); prev.className = 'ghost'; prev.textContent = '◀'; prev.disabled = page <= 0;
                                            const info = document.createElement('div'); info.style.color = 'var(--muted)'; info.style.fontWeight = '700'; info.textContent = `${page + 1} / ${totalPages}`;
                                            const next = document.createElement('button'); next.className = 'ghost'; next.textContent = '▶'; next.disabled = page >= totalPages - 1;
                                            prev.addEventListener('click', () => { page = Math.max(0, page - 1); backdrop._applyThumbPage = page; render(); });
                                            next.addEventListener('click', () => { page = Math.min(totalPages - 1, page + 1); backdrop._applyThumbPage = page; render(); });
                                            nav.appendChild(prev); nav.appendChild(info); nav.appendChild(next);
                                            thumbList.appendChild(nav);
                                        }
                                        if (isMobile) {
                                            if (sideThumbsData.length > PER_PAGE) {
                                                const vert = document.createElement('div'); vert.className = 'apply-thumb-vert';
                                                sideThumbsData.forEach((it, idx) => {
                                                    const globalIndex = idx;
                                                    const wrapper = document.createElement('label'); wrapper.className = 'sel-thumb'; wrapper.style.display = 'flex'; wrapper.style.alignItems = 'center'; wrapper.style.gap = '8px'; wrapper.style.padding = '6px';
                                                    const cb = document.createElement('input'); cb.type = 'checkbox'; cb.dataset.idx = globalIndex; try { cb.checked = !!(it.applied && it.appliedTo === `${w}×${h}`); } catch (e) {}
                                                    const img = document.createElement('img'); img.src = it.src || ''; img.alt = it.name || `Gambar ${globalIndex+1}`; img.style.width = '64px'; img.style.height = '48px'; img.style.objectFit = 'cover'; img.style.borderRadius = '6px';
                                                    const meta = document.createElement('div'); meta.style.flex = '1'; meta.innerHTML = `<div style="font-weight:600">${it.name || `Gambar ${globalIndex+1}`}</div><div style="font-size:0.85rem;color:#9aa4b2">${it.width ? it.width + ' × ' + (it.height || '-') : 'Dimensi tidak diketahui'}</div>`;
                                                    wrapper.appendChild(cb); wrapper.appendChild(img); wrapper.appendChild(meta);
                                                    vert.appendChild(wrapper);
                                                });
                                                thumbList.appendChild(vert);
                                            } else {
                                                const vert = document.createElement('div'); vert.className = 'apply-thumb-vert';
                                                slice.forEach((it, idx) => {
                                                    const globalIndex = start + idx;
                                                    const wrapper = document.createElement('label'); wrapper.className = 'sel-thumb'; wrapper.style.display = 'flex'; wrapper.style.alignItems = 'center'; wrapper.style.gap = '8px'; wrapper.style.padding = '6px';
                                                    const cb = document.createElement('input'); cb.type = 'checkbox'; cb.dataset.idx = globalIndex; try { cb.checked = !!(it.applied && it.appliedTo === `${w}×${h}`); } catch (e) {}
                                                    const img = document.createElement('img'); img.src = it.src || ''; img.alt = it.name || `Gambar ${globalIndex+1}`; img.style.width = '56px'; img.style.height = '40px'; img.style.objectFit = 'cover'; img.style.borderRadius = '6px';
                                                    const meta = document.createElement('div'); meta.style.flex = '1'; meta.innerHTML = `<div style="font-weight:600">${it.name || `Gambar ${globalIndex+1}`}</div><div style="font-size:0.85rem;color:#9aa4b2">${it.width ? it.width + ' × ' + (it.height || '-') : 'Dimensi tidak diketahui'}</div>`;
                                                    wrapper.appendChild(cb); wrapper.appendChild(img); wrapper.appendChild(meta);
                                                    vert.appendChild(wrapper);
                                                });
                                                thumbList.appendChild(vert);
                                            }
                                        } else {
                                            slice.forEach((it, idx) => {
                                                const globalIndex = start + idx;
                                                const wrapper = document.createElement('label'); wrapper.className = 'sel-thumb'; wrapper.style.display = 'flex'; wrapper.style.alignItems = 'center'; wrapper.style.gap = '8px'; wrapper.style.padding = '6px';
                                                const cb = document.createElement('input'); cb.type = 'checkbox'; cb.dataset.idx = globalIndex; cb.checked = !!(it.applied && it.appliedTo === `${w}×${h}`);
                                                const img = document.createElement('img'); img.src = it.src || ''; img.alt = it.name || `Gambar ${globalIndex+1}`; img.style.width = '56px'; img.style.height = '40px'; img.style.objectFit = 'cover'; img.style.borderRadius = '6px';
                                                const meta = document.createElement('div'); meta.style.flex = '1'; meta.innerHTML = `<div style="font-weight:600">${it.name || `Gambar ${globalIndex+1}`}</div><div style="font-size:0.85rem;color:#9aa4b2">${it.width ? it.width + ' × ' + (it.height || '-') : 'Dimensi tidak diketahui'}</div>`;
                                                wrapper.appendChild(cb); wrapper.appendChild(img); wrapper.appendChild(meta);
                                                thumbList.appendChild(wrapper);
                                            });
                                        }
                                    }

                                    render();
                                }

                                populateThumbList();

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

                        backdrop.classList.add('show');
                        try { backdrop.setAttribute('aria-hidden', 'false'); } catch (e) {}
                        try { wireApplyModalControls(); } catch (e) {}
    }


    function addToSideThumbnails(item) {
        const side = document.getElementById('side-thumbs');
        if (!side) {
            return;
        }
        try {
            const rightAside = document.querySelector('.sidebar.right');
            if (rightAside) rightAside.style.display = '';
        } catch (e) {}
        const it = Object.assign({ src: '', name: 'image', width: null, height: null, size: null, type: null, originalSrc: null, originalWidth: null, originalHeight: null, originalSize: null, applied: false }, item || {});
        if (!it.originalSrc) it.originalSrc = it.src;
        if (!it.originalWidth && it.width) it.originalWidth = it.width;
        if (!it.originalHeight && it.height) it.originalHeight = it.height;
        if (!it.originalSize && it.size) it.originalSize = it.size;
        sideThumbsData.push(it);
        sideThumbsPage = 0;
        renderSideThumbs(sideThumbsPage);
        try { updateExportPreview(); } catch (e) {}
    }

    function renderSideThumbs(page) {
        const side = document.getElementById('side-thumbs');
        if (!side) return;
        side.innerHTML = '';
        const isGrid3x2 = side.classList && side.classList.contains && side.classList.contains('grid-3x2');
        const isHorizontal = side.classList && side.classList.contains && side.classList.contains('horizontal-scroll');
        const pageSize = (function() {
            try { const v = parseInt(side.dataset.maxThumbs, 10); return (isNaN(v) || v <= 0) ? (isGrid3x2 ? 6 : SIDE_THUMBS_PAGE_SIZE) : v; } catch (e) { return (isGrid3x2 ? 6 : SIDE_THUMBS_PAGE_SIZE); }
        })();

    const totalPages = Math.max(1, Math.ceil(sideThumbsData.length / pageSize));

    const disableControls = side && side.dataset && side.dataset.noControls === 'true';

    if (isHorizontal) {
        if (!disableControls) {
            const controls = document.createElement('div');
            controls.className = 'side-thumbs-controls';
            const left = document.createElement('button'); left.className = 'thumb-nav'; left.textContent = '◀';
            const right = document.createElement('button'); right.className = 'thumb-nav'; right.textContent = '▶';
            left.addEventListener('click', () => { try { side.scrollBy({ left: -Math.round(side.clientWidth * 0.7), behavior: 'smooth' }); } catch (e) { side.scrollLeft = Math.max(0, side.scrollLeft - Math.round(side.clientWidth * 0.7)); } });
            right.addEventListener('click', () => { try { side.scrollBy({ left: Math.round(side.clientWidth * 0.7), behavior: 'smooth' }); } catch (e) { side.scrollLeft = Math.min(side.scrollWidth, side.scrollLeft + Math.round(side.clientWidth * 0.7)); } });
            controls.appendChild(left); controls.appendChild(right);
            side.appendChild(controls);
        }
    } else {
        const noPaging = (isGrid3x2 && totalPages <= 1);
        if (!noPaging && !disableControls) {
            const controls = document.createElement('div');
            controls.className = 'side-thumbs-controls';
            const prev = document.createElement('button'); prev.className = 'thumb-nav'; prev.textContent = '◀';
            const next = document.createElement('button'); next.className = 'thumb-nav'; next.textContent = '▶';
            const info = document.createElement('div'); info.className = 'thumb-info'; info.textContent = `${(page||0)+1} / ${totalPages}`;
            prev.disabled = (page <= 0);
            next.disabled = (page >= totalPages - 1);
            prev.addEventListener('click', () => { sideThumbsPage = Math.max(0, sideThumbsPage - 1); renderSideThumbs(sideThumbsPage); });
            next.addEventListener('click', () => { sideThumbsPage = Math.min(totalPages - 1, sideThumbsPage + 1); renderSideThumbs(sideThumbsPage); });
            controls.appendChild(prev); controls.appendChild(info); controls.appendChild(next);
            side.appendChild(controls);
        }
    }

        if (sideThumbsData.length === 0) {
            const empty = document.createElement('div'); empty.className = 'thumb-empty'; empty.textContent = 'Tidak ada gambar tambahan';
            side.appendChild(empty);
            return;
        }

    const currentPage = (typeof page === 'number' && page >= 0) ? page : (typeof sideThumbsPage === 'number' ? sideThumbsPage : 0);
    sideThumbsPage = currentPage;
    const start = currentPage * pageSize;
    const itemsToRender = isHorizontal ? sideThumbsData.slice(0) : sideThumbsData.slice(start, start + pageSize);
        itemsToRender.forEach((itemData, idx) => {
            const globalIndex = isHorizontal ? idx : (start + idx);
            const item = document.createElement('div'); item.className = 'thumb';
            const img = document.createElement('img'); img.src = itemData.src; img.alt = itemData.name || 'thumb';
            item.appendChild(img);

            const delBtn = document.createElement('button');
            delBtn.type = 'button';
            delBtn.className = 'thumb-delete';
            delBtn.setAttribute('aria-label', 'Hapus gambar');
            delBtn.innerHTML = '<i class="fas fa-trash"></i>';
            delBtn.addEventListener('click', (ev) => {
                ev.stopPropagation();
                try { deleteSideThumb(globalIndex); } catch (e) { console.error('deleteSideThumb error', e); }
            });
            item.appendChild(delBtn);

            const meta = document.createElement('div'); meta.className = 'thumb-meta';
            const dimRow = document.createElement('div'); dimRow.className = 'meta-row';
            const origW = (typeof itemData.originalWidth !== 'undefined' && itemData.originalWidth) ? itemData.originalWidth : (itemData.width || null);
            const origH = (typeof itemData.originalHeight !== 'undefined' && itemData.originalHeight) ? itemData.originalHeight : (itemData.height || null);
            dimRow.innerHTML = `<strong>Dimensi:</strong> <span class="meta-dim">${origW ? origW + ' × ' + (origH || '-') : '-'}</span>`;
            const newRow = document.createElement('div'); newRow.className = 'meta-row';
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
                    if (currentPreviewSrc && clickedSrc && currentPreviewSrc === clickedSrc) return;

                    function loadIntoPreview(src, meta = {}) {
                        originalImage = new Image();
                        originalImage.onload = function () {
                            const origW = (typeof meta.originalWidth !== 'undefined' && meta.originalWidth !== null) ? meta.originalWidth : this.width;
                            const origH = (typeof meta.originalHeight !== 'undefined' && meta.originalHeight !== null) ? meta.originalHeight : this.height;
                            originalWidth = origW; originalHeight = origH; aspectRatio = originalWidth / originalHeight;
                            if (originalDimensions) originalDimensions.textContent = `${originalWidth} × ${originalHeight}`;
                            if (widthInput) widthInput.value = (typeof meta.width !== 'undefined' && meta.width !== null) ? meta.width : this.width;
                            if (heightInput) heightInput.value = (typeof meta.height !== 'undefined' && meta.height !== null) ? meta.height : this.height;
                            if (imagePreview) imagePreview.src = src;
                            if (placeholder) placeholder.style.display = 'none';
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

                    if (typeof currentPreviewSideIndex === 'number' && sideThumbsData[currentPreviewSideIndex] && sideThumbsData[currentPreviewSideIndex].src === currentPreviewSrc) {
                        const prevIdx = currentPreviewSideIndex;
                        const a = sideThumbsData[prevIdx];
                        const b = sideThumbsData[globalIndex];
                            dbg('swapping side thumbnails', prevIdx, globalIndex);
                        const fields = ['src','width','height','size','type','name','originalSrc','originalWidth','originalHeight','originalSize','applied','appliedTo'];
                        fields.forEach(f => { const tmp = a[f]; a[f] = b[f]; b[f] = tmp; });
                        currentPreviewSideIndex = globalIndex;
                            dbg('after swap, loading into preview index', currentPreviewSideIndex, sideThumbsData[currentPreviewSideIndex]);
                        loadIntoPreview(sideThumbsData[currentPreviewSideIndex].src, sideThumbsData[currentPreviewSideIndex]);
                        return;
                    }

                    if (currentPreviewSrc) {
                        const previewMeta = {
                            src: currentPreviewSrc,
                            name: (initialState && initialState.name) ? initialState.name : (currentFile && currentFile.name) ? currentFile.name : 'image',
                            originalWidth: (typeof originalWidth !== 'undefined' ? originalWidth : (initialState && initialState.width) || null),
                            originalHeight: (typeof originalHeight !== 'undefined' ? originalHeight : (initialState && initialState.height) || null),
                            width: (lastCanvasDataURL ? (lastAppliedWidth || originalWidth) : (initialState && initialState.width) || originalWidth),
                            height: (lastCanvasDataURL ? (lastAppliedHeight || originalHeight) : (initialState && initialState.height) || originalHeight),
                            size: (initialState && initialState.size) ? initialState.size : estimateDataURLSize(currentPreviewSrc),
                            type: (initialState && initialState.type) ? initialState.type : (currentFile && currentFile.type) ? currentFile.type : null,
                            originalSrc: currentPreviewSrc,
                            originalSize: (initialState && initialState.size) ? initialState.size : null,
                            applied: !!lastCanvasDataURL,
                            appliedTo: lastCanvasDataURL ? `${lastAppliedWidth}×${lastAppliedHeight}` : null
                        };
                        if (!previewMeta.src) previewMeta.src = previewMeta.originalSrc || (initialState && initialState.src) || (imagePreview && imagePreview.src) || '';
                        if (!itemData || !itemData.src) {
                            if (itemData && itemData.originalSrc) itemData.src = itemData.originalSrc;
                            else {
                                showNotification('Gagal memuat gambar tujuan (sumber tidak ditemukan)', 'error');
                                return;
                            }
                        }
                        dbg('moving preview into sidebar slot', globalIndex, previewMeta);
                        sideThumbsData[globalIndex] = Object.assign({}, previewMeta);
                        currentPreviewSideIndex = globalIndex;
                        loadIntoPreview(itemData.src, itemData);
                        return;
                    }

                    currentPreviewSideIndex = globalIndex;
                    loadIntoPreview(itemData.src, itemData);
                } catch (e) {
                    currentPreviewSideIndex = globalIndex;
                    loadIntoPreview(itemData.src, itemData);
                    return;
                }
            });
            if (typeof currentPreviewSideIndex === 'number' && currentPreviewSideIndex === globalIndex) {
                item.classList.add('selected-thumb');
            }
            side.appendChild(item);
        });
    }

        function deleteSideThumb(index) {
            try {
                if (!Number.isInteger(index) || index < 0 || index >= sideThumbsData.length) return;
                if (typeof currentPreviewSideIndex === 'number' && currentPreviewSideIndex === index) {
                    currentPreviewSideIndex = null;
                    if (initialState && initialState.src && imagePreview) {
                        imagePreview.src = initialState.src; originalWidth = initialState.width || originalWidth; originalHeight = initialState.height || originalHeight;
                        if (newDimensions) newDimensions.textContent = `${initialState.width || '-'} × ${initialState.height || '-'}`;
                    }
                }
                sideThumbsData.splice(index, 1);
                if (!sideThumbsData.length) {
                    try {
                        const rightAside = document.querySelector('.sidebar.right');
                        if (rightAside) rightAside.style.display = 'none';
                    } catch (e) {}
                }
                if (typeof currentPreviewSideIndex === 'number' && currentPreviewSideIndex > index) currentPreviewSideIndex -= 1;
                const side = document.getElementById('side-thumbs');
                const isGrid3x2 = side && side.classList && side.classList.contains && side.classList.contains('grid-3x2');
                const pageSize = (function() { try { const v = parseInt(side && side.dataset && side.dataset.maxThumbs, 10); return (isNaN(v) || v <= 0) ? (isGrid3x2 ? 6 : SIDE_THUMBS_PAGE_SIZE) : v; } catch (e) { return (isGrid3x2 ? 6 : SIDE_THUMBS_PAGE_SIZE); } })();
                const totalPages = Math.max(1, Math.ceil(sideThumbsData.length / pageSize));
                if (sideThumbsPage >= totalPages) sideThumbsPage = Math.max(0, totalPages - 1);
                renderSideThumbs(sideThumbsPage);
                showNotification('Gambar dihapus');
                try { updateExportPreview(); } catch (e) {}
            } catch (e) { console.error('deleteSideThumb error', e); showNotification('Gagal menghapus gambar', 'error'); }
        }

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
            rightSidebar.insertBefore(side, rightSidebar.firstElementChild);
        }
        try { localStorage.setItem('sideThumbsPos', pos); } catch (e) {}
        if (toggle) {
            toggle.setAttribute('aria-pressed', pos === 'left' ? 'true' : 'false');
            toggle.textContent = pos === 'left' ? 'Thumbs: L' : 'Thumbs: R';
        }
    }

    (function wireThumbsToggle(){
        const toggle = document.getElementById('thumbs-pos-toggle');
        if (!toggle) return;
        const pref = (function(){ try { return localStorage.getItem('sideThumbsPos'); } catch (e) { return null; } })() || 'right';
        setSideThumbsPosition(pref);
        toggle.addEventListener('click', () => {
            const cur = (toggle.getAttribute('aria-pressed') === 'true') ? 'left' : 'right';
            const next = cur === 'left' ? 'right' : 'left';
            setSideThumbsPosition(next);
        });
    })();

    ['brightness','contrast','blur'].forEach(id => {
        const el = document.getElementById(id === 'blur' ? 'blur-radius' : id);
        const valEl = document.getElementById(id === 'blur' ? 'blur-value' : `${id}-value`);
        if (!el) return;
        el.addEventListener('input', () => {
            if (valEl) valEl.textContent = id === 'blur' ? `${el.value}px` : `${el.value}%`;
            applyChanges(false);
        });
    });

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

                    bgBtns.forEach(b => {
                        b.classList.remove('active');
                        try { b.setAttribute('aria-pressed', 'false'); } catch (e) {}
                    });
                    btn.classList.add('active');
                    try { btn.setAttribute('aria-pressed', 'true'); } catch (e) {}

                    showNotification(`Ukuran diatur ke ${w} × ${h}`);
                    try {
                        if (originalImage) {
                            dbg('bg-size clicked -> auto-applying to preview', w, h);
                            applyChanges(false);
                        } else {
                            showNotification('Muat gambar terlebih dahulu untuk menerapkan ukuran', 'error');
                        }
                    } catch (e) { console.warn('[debug] auto-apply failed', e); }
                }
            });
        });
    })();

    (function wireSizesToggle() {
        const sizesTitle = document.getElementById('sizes-title');
        if (!sizesTitle) return;
        sizesTitle.setAttribute('role', 'button');
        sizesTitle.setAttribute('tabindex', '0');
        sizesTitle.setAttribute('aria-expanded', 'false');
        const sizesCard = sizesTitle.closest('.sizes-card');
        if (!sizesCard) return;
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


    (function wireGenericCollapsibles(){
        const toggles = document.querySelectorAll('.collapsible-toggle');
        if (!toggles || !toggles.length) return;
        toggles.forEach(t => {
            let content = t.nextElementSibling;
            const parentSection = t.closest('section.card');
            if (!content && parentSection) {
                content = parentSection.querySelector('.quick-presets, .filter-presets, .control-row, .background-sizes');
            }
            if (!content) return;
            t.setAttribute('aria-expanded', 'false');
            function toggle(){
                const isOpen = t.getAttribute('aria-expanded') === 'true';
                if (content.classList.contains('quick-presets') || content.classList.contains('filter-presets') || content.classList.contains('background-sizes')){
                    content.classList.toggle('hidden-collapsible');
                    t.setAttribute('aria-expanded', isOpen ? 'false' : 'true');
                } else {
                    if (parentSection && parentSection.classList.contains('compact')){
                        parentSection.classList.toggle('collapsed');
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

    if (qualityValue && qualitySlider) qualityValue.textContent = qualitySlider.value + '%';
    if (newDimensions && widthInput && heightInput) newDimensions.textContent = `${widthInput.value || '-'} × ${heightInput.value || '-'}`;

    (function wireControls() {
        if (fileInput) {
            fileInput.addEventListener('change', handleImageUpload);
        }
        if (uploadArea) {
            uploadArea.addEventListener('click', (e) => {
                try {
                    if (!fileInput) return;
                    if (uploadArea.tagName && uploadArea.tagName.toLowerCase() === 'label') return;
                    fileInput.click();
                } catch (err) {}
            });
            uploadArea.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    try {
                        if (!fileInput) return;
                        if (uploadArea.tagName && uploadArea.tagName.toLowerCase() === 'label') return;
                        fileInput.click();
                    } catch (err) {}
                }
            });
            uploadArea.addEventListener('dragover', (e) => { e.preventDefault(); uploadArea.classList.add('dragover'); });
            uploadArea.addEventListener('dragleave', (e) => { try { uploadArea.classList.remove('dragover'); } catch (err) {} });
            uploadArea.addEventListener('drop', (e) => {
                e.preventDefault(); try { uploadArea.classList.remove('dragover'); } catch (err) {}
                const dt = e.dataTransfer; if (!dt) return; const files = Array.from(dt.files || []);
                if (!files || !files.length) return;
                try {
                    if (fileInput) {
                        try {
                            const dataTransfer = new DataTransfer();
                            files.forEach(f => dataTransfer.items.add(f));
                            fileInput.files = dataTransfer.files;
                            handleImageUpload();
                        } catch (err) {
                            fileInput.files = files;
                            handleImageUpload();
                        }
                    }
                } catch (err) {}
            });
        }

        {
            const fileInput = document.getElementById('file-input');
            const allowMultiple = fileInput && fileInput.hasAttribute && fileInput.hasAttribute('multiple');
            const hasSideThumbs = document.getElementById('side-thumbs');
            if (applyBtn) {
                if (allowMultiple || hasSideThumbs) {
                    applyBtn.addEventListener('click', showApplyModal);
                } else {
                    applyBtn.addEventListener('click', (e) => {
                        e.preventDefault();
                        if (!originalImage) { showNotification('Muat gambar terlebih dahulu', 'error'); return; }
                        dbg('apply button (direct) clicked');
                        applyChanges(false);
                    });
                }
            }
        }
        async function handleDownloadClick(e) {
            try {
                if (e && e.preventDefault) e.preventDefault();
                const exportIframe = document.getElementById('export-preview-iframe');
                if (exportIframe) {
                    try { await downloadExportPreview(); return; } catch (err) { console.error('downloadExportPreview error', err); }
                }
                showDownloadModal();
            } catch (err) { console.error('handleDownloadClick error', err); showDownloadModal(); }
        }

        const _fileInput_for_download = document.getElementById('file-input');
        const _allowMultiple_for_download = _fileInput_for_download && _fileInput_for_download.hasAttribute && _fileInput_for_download.hasAttribute('multiple');
        const _hasSideThumbs_for_download = document.getElementById('side-thumbs');
        if (downloadBtn) {
            if (_allowMultiple_for_download || _hasSideThumbs_for_download) {
                downloadBtn.addEventListener('click', handleDownloadClick);
            } else {
                downloadBtn.addEventListener('click', async (e) => {
                    try {
                        if (e && e.preventDefault) e.preventDefault();
                        const exportIframe = document.getElementById('export-preview-iframe');
                        if (exportIframe) {
                            try { await downloadExportPreview(); return; } catch (err) { console.error('downloadExportPreview error', err); }
                        }
                        downloadImage();
                    } catch (err) {
                        console.error('direct download failed', err);
                        try { handleDownloadClick(); } catch (e) {}
                    }
                });
            }
        }
        if (downloadExportBtn) downloadExportBtn.addEventListener('click', handleDownloadClick);
        if (resetBtn) {
            try { resetBtn.type = resetBtn.type || 'button'; } catch (e) {}
            if (!resetBtn._wired) {
                resetBtn.addEventListener('click', resetEdit);
                resetBtn._wired = true;
            }
            try { resetBtn.disabled = false; } catch (e) {}
        }
        if (widthInput) widthInput.addEventListener('input', handleSizeInput);
        if (heightInput) heightInput.addEventListener('input', handleSizeInput);
        if (qualitySlider && qualityValue) qualitySlider.addEventListener('input', () => { qualityValue.textContent = qualitySlider.value + '%'; });

        try {
            const canvasActions = document.querySelector('.canvas-actions');
            if (canvasActions) {
                    const fileInput = document.getElementById('file-input');
                    const allowMultiple = fileInput && fileInput.hasAttribute && fileInput.hasAttribute('multiple');
                    const hasSideThumbs = document.getElementById('side-thumbs');
                    
                    if (allowMultiple || hasSideThumbs) {
                        if (!document.getElementById('apply-direct-btn')) {
                            const applyDirectBtn = document.createElement('button');
                            applyDirectBtn.className = 'btn small';
                            applyDirectBtn.id = 'apply-direct-btn';
                            applyDirectBtn.innerHTML = '<i class="fas fa-bolt"></i> Terapkan Langsung';
                            if (applyBtn && applyBtn.parentNode === canvasActions) canvasActions.insertBefore(applyDirectBtn, applyBtn.nextSibling);
                            else canvasActions.appendChild(applyDirectBtn);
                        }
                        (function wireApplyDirect(){
                            const btn = document.getElementById('apply-direct-btn');
                            if (!btn) return;
                            if (btn._wired) return;
                            btn.addEventListener('click', (e) => {
                                e.preventDefault();
                                if (!originalImage) { showNotification('Muat gambar terlebih dahulu', 'error'); return; }
                                dbg('apply-direct button clicked');
                                applyChanges(false);
                            });
                            btn._wired = true;
                        })();
                    }

            }
        } catch (err) {  }
    })();

    function closeApplyModal() {
        const bd = document.getElementById('apply-modal-backdrop');
        if (!bd) return;
        bd.classList.remove('show');
        try { bd.setAttribute('aria-hidden', 'true'); } catch (e) {}
        try { if (applyBtn) applyBtn.focus(); } catch (e) {}
    }

    function wireApplyModalControls() {
        const bd = document.getElementById('apply-modal-backdrop');
        if (!bd) return;
        if (bd._wired) return;

        const closeBtn = bd.querySelector('#apply-modal-close');
        if (closeBtn) closeBtn.addEventListener('click', (e) => { e.preventDefault(); closeApplyModal(); });
        bd.addEventListener('click', (e) => { if (e.target === bd) closeApplyModal(); });
        document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { const b = document.getElementById('apply-modal-backdrop'); if (b && b.classList.contains('show')) closeApplyModal(); } });

        bd._wired = true;
    }

    try { wireApplyModalControls(); } catch (e) {}

    (function wireTopNav(){
        const navLinks = document.querySelectorAll('.top-actions .nav-link');
        if (!navLinks || !navLinks.length) return;

        function clearActive(){
            navLinks.forEach(l => l.classList.remove('active'));
        }

        navLinks.forEach(link => {
            const href = link.getAttribute('href') || '';
            const targetId = (link.dataset && link.dataset.target) ? link.dataset.target : (href.startsWith('#') ? href.replace('#','') : '');
            link.addEventListener('click', (e) => {
                if (href && !href.startsWith('#') && !targetId) {
                    return; 
                }
                e.preventDefault();
                const target = document.getElementById(targetId);
                if (target) {
                    try { target.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (err) { target.scrollIntoView(); }
                    setTimeout(() => { try { target.setAttribute('tabindex','-1'); target.focus({preventScroll:true}); } catch (err) {} }, 420);
                } else if (href && !href.startsWith('#')) {
                    window.location.href = href;
                }
                clearActive();
                link.classList.add('active');
            });
        });
    })();
});
