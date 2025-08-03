
/// <reference lib="webworker" />

let ctx = null;
let canvas = null;

self.onmessage = async (event) => {
    const { type, canvas: canvasFromMain, state, bitmaps, viewport } = event.data;

    if (type === 'init' && canvasFromMain) {
        canvas = canvasFromMain;
        ctx = canvas.getContext('2d', { alpha: false });
        return;
    }

    if (type === 'draw' && ctx && canvas && state && bitmaps && viewport) {
        if (canvas.width !== viewport.width || canvas.height !== viewport.height) {
            canvas.width = viewport.width;
            canvas.height = viewport.height;
        }
        try {
            await drawCanvas(ctx, canvas.width, canvas.height, state, bitmaps);
        } catch (error) {
            console.error('Error during canvas draw in UI worker:', error);
        }
    }
};

async function drawCanvas(
    ctx,
    width,
    height,
    state,
    bitmaps
) {
    const {
        layoutMode, images, watermark, background,
        gap, globalZoom, mainZoom, bgBlur, bgOpacity
    } = state;
    
    // 1. Draw Background
    ctx.clearRect(0, 0, width, height);
    if (background.type === 'image' && bitmaps.background) {
        ctx.drawImage(bitmaps.background, 0, 0, width, height);
    } else {
        ctx.fillStyle = background.type === 'color' && background.value ? background.value : '#F3F4F6';
        ctx.fillRect(0, 0, width, height);
    }

    // If no images, show a placeholder message and stop.
    if (images.length === 0) {
      ctx.fillStyle = '#6b7280'; // gray-500
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = '24px Montserrat';
      ctx.fillText('Upload images to begin', width / 2, height / 2);
      return;
    }

    // 2. Draw Image Grid/Layout
    const drawImage = (img, x, y, w, h, extraZoom = 1) => {
        if (w <= 0 || h <= 0 || img.width <= 0 || img.height <= 0) return;
        const zoom = globalZoom * extraZoom;
        
        ctx.save();
        ctx.beginPath();
        ctx.rect(x, y, w, h);
        ctx.clip();

        const imgRatio = img.width / img.height;
        const cellRatio = w / h;
        
        let baseW, baseH;

        if (imgRatio > cellRatio) {
            baseW = w;
            baseH = w / imgRatio;
        } else {
            baseH = h;
            baseW = h * imgRatio;
        }

        const renderW = baseW * zoom;
        const renderH = baseH * zoom;
        const renderX = x + (w - renderW) / 2;
        const renderY = y + (h - renderH) / 2;

        ctx.drawImage(img, renderX, renderY, renderW, renderH);
        ctx.restore();
    };

    const loadedGridImages = bitmaps.grid;

    switch (layoutMode) {
        case 'grid': {
            const cols = Math.max(1, Math.ceil(Math.sqrt(loadedGridImages.length)));
            const rows = Math.max(1, Math.ceil(loadedGridImages.length / cols));
            const cellWidth = Math.max(0, (width - (cols + 1) * gap) / cols);
            const cellHeight = Math.max(0, (height - (rows + 1) * gap) / rows);
            loadedGridImages.forEach((img, i) => {
                const col = i % cols;
                const row = Math.floor(i / cols);
                const x = gap + col * (cellWidth + gap);
                const y = gap + row * (cellHeight + gap);
                drawImage(img, x, y, cellWidth, cellHeight);
            });
            break;
        }
        case 'left-big':
        case 'right-big': {
            const isLeftBig = layoutMode === 'left-big';
            const bigX = isLeftBig ? gap : width / 2 + gap / 2;
            const bigW = Math.max(0, width / 2 - gap * 1.5);
            const bigH = Math.max(0, height - gap * 2);
            drawImage(loadedGridImages[0], bigX, gap, bigW, bigH);

            if (loadedGridImages.length > 1) {
                const gridImages = loadedGridImages.slice(1);
                const cols = Math.max(1, Math.ceil(Math.sqrt(gridImages.length)));
                const rows = Math.max(1, Math.ceil(gridImages.length / cols));
                const startX = isLeftBig ? width / 2 + gap / 2 : gap;
                const availableWidth = Math.max(0, width / 2 - gap * 1.5);
                const cellWidth = Math.max(0, (availableWidth - (cols - 1) * gap) / cols);
                const cellHeight = Math.max(0, (height - (rows + 1) * gap) / rows);
                gridImages.forEach((img, i) => {
                    const col = i % cols;
                    const row = Math.floor(i / cols);
                    const x = startX + col * (cellWidth + gap);
                    const y = gap + row * (cellHeight + gap);
                    drawImage(img, x, y, cellWidth, cellHeight);
                });
            }
            break;
        }
        case 'top-big':
        case 'bottom-big': {
            const isTopBig = layoutMode === 'top-big';
            const bigY = isTopBig ? gap : height / 2 + gap / 2;
            const bigW = Math.max(0, width - gap * 2);
            const bigH = Math.max(0, height / 2 - gap * 1.5);
            drawImage(loadedGridImages[0], gap, bigY, bigW, bigH);
            
            if (loadedGridImages.length > 1) {
                const gridImages = loadedGridImages.slice(1);
                const startY = isTopBig ? height / 2 + gap / 2 : gap;
                const gridHeight = Math.max(0, height / 2 - gap * 1.5);
                const cols = Math.max(1, Math.ceil(Math.sqrt(gridImages.length)));
                const rows = Math.max(1, Math.ceil(gridImages.length / cols));
                const cellWidth = Math.max(0, (width - (cols + 1) * gap) / cols);
                const cellHeight = Math.max(0, (gridHeight - (rows - 1) * gap) / rows);
                gridImages.forEach((img, i) => {
                    const col = i % cols;
                    const row = Math.floor(i / cols);
                    const x = gap + col * (cellWidth + gap);
                    const y = startY + row * (cellHeight + gap);
                    drawImage(img, x, y, cellWidth, cellHeight);
                });
            }
            break;
        }
        case 'single-blur': {
            const bgImages = loadedGridImages.slice(1);
            if (bgImages.length > 0) {
                ctx.save();
                ctx.filter = `blur(${bgBlur}px)`;
                ctx.globalAlpha = bgOpacity;
                const cols = Math.max(1, Math.ceil(Math.sqrt(bgImages.length)));
                const rows = Math.max(1, Math.ceil(bgImages.length / cols));
                const cellWidth = width / cols;
                const cellHeight = height / rows;
                bgImages.forEach((img, i) => {
                    const col = i % cols;
                    const row = Math.floor(i / cols);
                    ctx.drawImage(img, col * cellWidth, row * cellHeight, cellWidth, cellHeight);
                });
                ctx.restore();
            }

            const maxW = width * 0.8;
            const maxH = height * 0.9;
            const cellX = (width - maxW) / 2;
            const cellY = (height - maxH) / 2;
            drawImage(loadedGridImages[0], cellX, cellY, maxW, maxH, mainZoom);
            break;
        }
        case 'freeform': {
            const sortedImageStates = [...images].sort((a, b) => (a.zIndex || 0) - (b.zIndex || 0));
            sortedImageStates.forEach((imgState) => {
                const imgIndex = images.findIndex(i => i.id === imgState.id);
                if (imgIndex === -1) return;

                const loadedImg = loadedGridImages[imgIndex];
                if (loadedImg && imgState.x != null && imgState.y != null && imgState.width != null && imgState.height != null) {
                    ctx.drawImage(loadedImg, imgState.x, imgState.y, imgState.width, imgState.height);
                }
            });
            break;
        }
    }

    // 3. Draw Watermark
    if (watermark && bitmaps.watermark && bitmaps.watermark.width > 0 && bitmaps.watermark.height > 0) {
        ctx.save();
        ctx.globalAlpha = watermark.opacity;
        const aspect = bitmaps.watermark.width / bitmaps.watermark.height;
        const w = (width / 100) * watermark.size;
        const h = w / aspect;
        const margin = gap;
        let x = 0, y = 0;
        switch (watermark.position) {
            case 'top-left': x = margin; y = margin; break;
            case 'top-right': x = width - w - margin; y = margin; break;
            case 'bottom-left': x = margin; y = height - h - margin; break;
            case 'bottom-right': x = width - w - margin; y = height - h - margin; break;
            case 'center': x = (width - w) / 2; y = (height - h) / 2; break;
        }
        ctx.drawImage(bitmaps.watermark, x, y, w, h);
        ctx.restore();
    }
}
