export type LayoutMode =
  | 'grid'
  | 'left-big'
  | 'right-big'
  | 'top-big'
  | 'bottom-big'
  | 'single-blur'
  | 'freeform';

export interface ImageState {
  id: string;
  url: string;
  file: File;
  // Properties for freeform layout
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  zIndex?: number;
}

export interface TextLayer {
  id:string;
  text: string;
  x: number;
  y: number;
  fontSize: number;
  fontFamily: string;
  color: string;
  rotation: number;
  shadow: boolean;
  backgroundColor: string;
  backgroundOpacity: number;
  padding: number;
}

export type WatermarkPosition = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'center';

export interface WatermarkState {
  id: string;
  url: string;
  file: File;
  opacity: number;
  size: number; // percentage of canvas width
  position: WatermarkPosition;
}

export type BackgroundType = 'color' | 'image';

export interface BackgroundState {
    type: BackgroundType;
    value: string | ImageState | null; 
}

// --- Worker-related types ---

export interface SerializableImageState {
  id: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  zIndex?: number;
}

// Use Omit to create serializable versions of types with File objects
export type SerializableWatermarkState = Omit<WatermarkState, 'file' | 'url'>;
export type SerializableBackgroundState = {
    type: BackgroundType;
    value: string | SerializableImageState | null;
};

// --- For UI Worker ---
export interface WorkerStatePayload {
    layoutMode: LayoutMode;
    images: SerializableImageState[];
    watermark: SerializableWatermarkState | null;
    background: SerializableBackgroundState;
    gap: number;
    globalZoom: number;
    mainZoom: number;
    bgBlur: number;
    bgOpacity: number;
}

export interface WorkerBitmapsPayload {
    grid: ImageBitmap[];
    watermark: ImageBitmap | null;
    background: ImageBitmap | null;
}

export type UIWorkerMessageData =
    | { type: 'init'; canvas: OffscreenCanvas }
    | {
        type: 'draw';
        state: WorkerStatePayload;
        bitmaps: WorkerBitmapsPayload;
        viewport: { width: number; height: number };
    };


// --- For Export Worker ---
export interface WorkerMessageData {
    canvas: OffscreenCanvas;
    sourceDimensions: { width: number; height: number };
    state: {
        layoutMode: LayoutMode;
        images: SerializableImageState[];
        textLayers: TextLayer[];
        watermark: SerializableWatermarkState | null;
        background: SerializableBackgroundState;
        gap: number;
        globalZoom: number;
        mainZoom: number;
        bgBlur: number;
        bgOpacity: number;
    };
    bitmaps: {
        grid: ImageBitmap[];
        watermark: ImageBitmap | null;
        background: ImageBitmap | null;
    };
}
