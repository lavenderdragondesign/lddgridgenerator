
/// <reference lib="webworker" />

import { WorkerMessageData, SerializableImageState } from './types';

// The worker's global scope is 'self'
self.onmessage = async (event: MessageEvent<WorkerMessageData>) => {
    const { canvas, sourceDimensions, state, bitmaps } = event.data;
    const ctx = canvas.getContext('2d');

    if (!ctx) {
        self.postMessage({ type: 'error', error: 'Could not get OffscreenCanvas context' });
        return;
    }

    try {
        await drawExportCanvas(ctx, canvas.width, canvas.height, sourceDimensions, state, bitmaps);
        const blob = await canvas.convertToBlob({ type: 'image/png' });
        // The second argument is for Transferable objects. A blob is not transferable.
        self.postMessage({ type: 'success', blob });
    } catch (error) {
        console.error('Error during canvas export in worker:', error);
        self.postMessage({ type: 'error', error: error instanceof Error ? error.message : String(error) });
    }
};

async function drawExportCanvas(
    ctx: OffscreenCanvasRenderingContext2D,
    EXPORT_WIDTH: number,
    EXPORT_HEIGHT: number,
    sourceDimensions: { width: number, height: number },
    state: WorkerMessageData['state'],
    bitmaps: WorkerMessageData['bitmaps']
) {
    const {
        layoutMode, images, textLayers, watermark, background,
        gap, globalZoom, mainZoom, bgBlur, bgOpacity
    } = state;

    const scaleX = EXPORT_WIDTH / sourceDimensions.width;
    const scaleY = EXPORT_HEIGHT / sourceDimensions.height;

    // 1. Draw Background
    ctx.clearRect(0, 0, EXPORT_WIDTH, EXPORT_HEIGHT);
    if (background.type === 'image' && bitmaps.background) {
        ctx.drawImage(bitmaps.background, 0, 0, EXPORT_WIDTH, EXPORT_HEIGHT);
    } else {
        ctx.fillStyle = background.type === 'color' && background.value ? background.value as string : '#F3F4F6';
        ctx.fillRect(0, 0, EXPORT_WIDTH, EXPORT_HEIGHT);
    }

    // 2. Draw Image Grid/Layout
    const drawImage = (img: ImageBitmap, x: number, y: number, w: number, h: number, extraZoom: number = 1) => {
        if (w <= 0 || h <= 0 || img.width <= 0 || img.height <= 0) return;
        const zoom = globalZoom * extraZoom;
        
        ctx.save();
        ctx.beginPath();
        ctx.rect(x, y, w, h);
        ctx.clip(); // Clip to the cell boundaries

        const imgRatio = img.width / img.height;
        const cellRatio = w / h;
        
        let baseW, baseH;

        // Force 'contain' logic to prevent cropping
        if (imgRatio > cellRatio) { // Image is wider than cell
            baseW = w;
            baseH = w / imgRatio;
        } else { // Image is taller than or same ratio as cell
            baseH = h;
            baseW = h * imgRatio;
        }

        // Now apply zoom to the base 'contain' size
        const renderW = baseW * zoom;
        const renderH = baseH * zoom;

        // Center the zoomed image within the cell
        const renderX = x + (w - renderW) / 2;
        const renderY = y + (h - renderH) / 2;

        ctx.drawImage(img, renderX, renderY, renderW, renderH);
        ctx.restore();
    };

    const exportGapX = gap * scaleX;
    const exportGapY = gap * scaleY;
    const loadedGridImages = bitmaps.grid;

    switch (layoutMode) {
        case 'grid': {
            if (loadedGridImages.length === 0) break;
            const cols = Math.max(1, Math.ceil(Math.sqrt(loadedGridImages.length)));
            const rows = Math.max(1, Math.ceil(loadedGridImages.length / cols));
            const cellWidth = Math.max(0, (EXPORT_WIDTH - (cols + 1) * exportGapX) / cols);
            const cellHeight = Math.max(0, (EXPORT_HEIGHT - (rows + 1) * exportGapY) / rows);
            loadedGridImages.forEach((img, i) => {
                const col = i % cols;
                const row = Math.floor(i / cols);
                const x = exportGapX + col * (cellWidth + exportGapX);
                const y = exportGapY + row * (cellHeight + exportGapY);
                drawImage(img, x, y, cellWidth, cellHeight);
            });
            break;
        }
        case 'left-big':
        case 'right-big': {
            const isLeftBig = layoutMode === 'left-big';
            if (loadedGridImages.length > 0) {
                const bigX = isLeftBig ? exportGapX : EXPORT_WIDTH / 2 + exportGapX / 2;
                const bigW = Math.max(0, EXPORT_WIDTH / 2 - exportGapX * 1.5);
                const bigH = Math.max(0, EXPORT_HEIGHT - exportGapY * 2);
                drawImage(loadedGridImages[0], bigX, exportGapY, bigW, bigH);
            }
            if (loadedGridImages.length > 1) {
                const gridImages = loadedGridImages.slice(1);
                const cols = Math.max(1, Math.ceil(Math.sqrt(gridImages.length)));
                const rows = Math.max(1, Math.ceil(gridImages.length / cols));
                const startX = isLeftBig ? EXPORT_WIDTH / 2 + exportGapX / 2 : exportGapX;
                const availableWidth = Math.max(0, EXPORT_WIDTH / 2 - exportGapX * 1.5);
                const cellWidth = Math.max(0, (availableWidth - (cols - 1) * exportGapX) / cols);
                const cellHeight = Math.max(0, (EXPORT_HEIGHT - (rows + 1) * exportGapY) / rows);
                gridImages.forEach((img, i) => {
                    const col = i % cols;
                    const row = Math.floor(i / cols);
                    const x = startX + col * (cellWidth + exportGapX);
                    const y = exportGapY + row * (cellHeight + exportGapY);
                    drawImage(img, x, y, cellWidth, cellHeight);
                });
            }
            break;
        }
        case 'top-big':
        case 'bottom-big': {
            if (loadedGridImages.length > 0) {
                const isTopBig = layoutMode === 'top-big';
                const bigY = isTopBig ? exportGapY : EXPORT_HEIGHT / 2 + exportGapY / 2;
                const bigW = Math.max(0, EXPORT_WIDTH - exportGapX * 2);
                const bigH = Math.max(0, EXPORT_HEIGHT / 2 - exportGapY * 1.5);
                drawImage(loadedGridImages[0], exportGapX, bigY, bigW, bigH);
            }
            if (loadedGridImages.length > 1) {
                const isTopBig = layoutMode === 'top-big';
                const gridImages = loadedGridImages.slice(1);
                const startY = isTopBig ? EXPORT_HEIGHT / 2 + exportGapY / 2 : exportGapY;
                const gridHeight = Math.max(0, EXPORT_HEIGHT / 2 - exportGapY * 1.5);
                const cols = Math.max(1, Math.ceil(Math.sqrt(gridImages.length)));
                const rows = Math.max(1, Math.ceil(gridImages.length / cols));
                const cellWidth = Math.max(0, (EXPORT_WIDTH - (cols + 1) * exportGapX) / cols);
                const cellHeight = Math.max(0, (gridHeight - (rows - 1) * exportGapY) / rows);
                gridImages.forEach((img, i) => {
                    const col = i % cols;
                    const row = Math.floor(i / cols);
                    const x = exportGapX + col * (cellWidth + exportGapX);
                    const y = startY + row * (cellHeight + exportGapY);
                    drawImage(img, x, y, cellWidth, cellHeight);
                });
            }
            break;
        }
        case 'single-blur': {
            const bgImages = loadedGridImages.slice(1);
            if (bgImages.length > 0) {
                ctx.save();
                ctx.filter = `blur(${bgBlur * scaleX}px)`;
                ctx.globalAlpha = bgOpacity;
                const cols = Math.max(1, Math.ceil(Math.sqrt(bgImages.length)));
                const rows = Math.max(1, Math.ceil(bgImages.length / cols));
                const cellWidth = EXPORT_WIDTH / cols;
                const cellHeight = EXPORT_HEIGHT / rows;
                bgImages.forEach((img, i) => {
                    const col = i % cols;
                    const row = Math.floor(i / cols);
                    ctx.drawImage(img, col * cellWidth, row * cellHeight, cellWidth, cellHeight);
                });
                ctx.restore();
            }
            if (loadedGridImages.length > 0) {
                const maxW = EXPORT_WIDTH * 0.8;
                const maxH = EXPORT_HEIGHT * 0.9;
                const cellX = (EXPORT_WIDTH - maxW) / 2;
                const cellY = (EXPORT_HEIGHT - maxH) / 2;
                drawImage(loadedGridImages[0], cellX, cellY, maxW, maxH, mainZoom);
            }
            break;
        }
        case 'freeform': {
            const sortedImageStates = [...images].sort((a, b) => (a.zIndex || 0) - (b.zIndex || 0));
            sortedImageStates.forEach((imgState) => {
                const loadedImg = loadedGridImages[images.findIndex(i => i.id === imgState.id)];
                if (loadedImg && imgState.x != null && imgState.y != null && imgState.width != null && imgState.height != null) {
                    ctx.drawImage(loadedImg, imgState.x * scaleX, imgState.y * scaleY, imgState.width * scaleX, imgState.height * scaleY);
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
        const w = (EXPORT_WIDTH / 100) * watermark.size;
        const h = w / aspect;
        const marginX = exportGapX;
        const marginY = exportGapY;
        let x = 0, y = 0;
        switch (watermark.position) {
            case 'top-left': x = marginX; y = marginY; break;
            case 'top-right': x = EXPORT_WIDTH - w - marginX; y = marginY; break;
            case 'bottom-left': x = marginX; y = EXPORT_HEIGHT - h - marginY; break;
            case 'bottom-right': x = EXPORT_WIDTH - w - marginX; y = EXPORT_HEIGHT - h - marginY; break;
            case 'center': x = (EXPORT_WIDTH - w) / 2; y = (EXPORT_HEIGHT - h) / 2; break;
        }
        ctx.drawImage(bitmaps.watermark, x, y, w, h);
        ctx.restore();
    }

    // 4. Draw Text Layers
    for(const layer of textLayers) {
      // It's necessary to load the font in the worker before using it.
      // This is a simplified approach. For production, more robust font loading is needed.
      // await self.fonts.load(`${layer.fontSize * scaleY}px ${layer.fontFamily}`);

      ctx.save();
      ctx.translate(layer.x * scaleX, layer.y * scaleY);
      ctx.rotate(layer.rotation * Math.PI / 180);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      
      const scaledFontSize = layer.fontSize * scaleY;
      const scaledPadding = layer.padding * scaleY;
      ctx.font = `${scaledFontSize}px '${layer.fontFamily}'`;

      if (layer.backgroundOpacity > 0) {
          const metrics = ctx.measureText(layer.text);
          const rectW = metrics.width + scaledPadding * 2;
          const rectH = scaledFontSize + scaledPadding * 2;
          ctx.globalAlpha = layer.backgroundOpacity;
          ctx.fillStyle = layer.backgroundColor;
          ctx.fillRect(-rectW / 2, -rectH / 2, rectW, rectH);
          ctx.globalAlpha = 1;
      }
      if (layer.shadow) {
          ctx.shadowColor = 'rgba(0, 0, 0, 0.75)';
          ctx.shadowBlur = 10 * scaleY;
          ctx.shadowOffsetX = 5 * scaleX;
          ctx.shadowOffsetY = 5 * scaleY;
      }
      ctx.fillStyle = layer.color;
      ctx.fillText(layer.text, 0, 0);
      ctx.restore();
    }
}