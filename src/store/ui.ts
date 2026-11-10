/** Workspace/UI state: navigation, viewport, panels, overlays and playback. */

import { create } from 'zustand';

export type Screen =
  | 'home'
  | 'editor'
  | 'studios'
  | 'gui'
  | 'packs'
  | 'creator'
  | 'scene'
  | 'palettes'
  | 'playground'
  | 'tileset'
  | 'showcase'
  | 'settings'
  | 'docs';

/** Which pack workflow the pack studio shows. */
export type PackMode = 'game' | 'icons';

export type DialogId =
  | 'new-project'
  | 'open-project'
  | 'export'
  | 'import-image'
  | 'canvas-size'
  | 'shortcuts'
  | 'about'
  | 'rename'
  | 'publish'
  | 'onboarding'
  | 'tags'
  | 'nine-slice'
  | null;

export type PlayMode = 'forward' | 'reverse' | 'pingpong';

export interface Toast {
  id: number;
  message: string;
  kind: 'info' | 'success' | 'warning' | 'error';
}

export interface OnionSettings {
  enabled: boolean;
  previous: number;
  next: number;
  opacity: number;
  tintPrevious: string;
  tintNext: string;
}

interface UiState {
  screen: Screen;
  packMode: PackMode;
  dialog: DialogId;
  zoom: number;
  panX: number;
  panY: number;
  showGrid: boolean;
  gridSize: number;
  showPixelGrid: boolean;
  checker: 'transparent' | 'light' | 'dark' | 'custom';
  checkerColor: string;
  rightTab: 'layers' | 'color' | 'analysis' | 'settings';
  timelineVisible: boolean;
  timelineHeight: number;
  leftWidth: number;
  rightWidth: number;
  onion: OnionSettings;
  playing: boolean;
  playMode: PlayMode;
  fps: number;
  loop: boolean;
  previewOpen: boolean;
  previewScale: number;
  /** Bottom-sheet panel for narrow screens. */
  mobilePanel: 'none' | 'tool' | 'color' | 'layers' | 'timeline';
  toasts: Toast[];
  assistantHighlights: { x: number; y: number }[];
  showOpeningHelp: boolean;
  /** The game-style intro overlay (see `src/screens/Opening.tsx`). */
  openingOpen: boolean;
  cinemaOpen: boolean;
  cursor: { x: number; y: number } | null;

  setScreen: (screen: Screen) => void;
  setPackMode: (mode: PackMode) => void;
  openDialog: (dialog: DialogId) => void;
  closeDialog: () => void;
  setZoom: (zoom: number) => void;
  zoomBy: (factor: number) => void;
  zoomToFit: (canvasWidth: number, canvasHeight: number, viewportW: number, viewportH: number) => void;
  setPan: (x: number, y: number) => void;
  toggleGrid: () => void;
  set: (patch: Partial<UiState>) => void;
  setOnion: (patch: Partial<OnionSettings>) => void;
  setPlaying: (playing: boolean) => void;
  togglePlaying: () => void;
  pushToast: (message: string, kind?: Toast['kind']) => void;
  dismissToast: (id: number) => void;
  setHighlights: (points: { x: number; y: number }[]) => void;
  setCinemaOpen: (open: boolean) => void;
  setOpeningOpen: (open: boolean) => void;
  setMobilePanel: (panel: UiState['mobilePanel']) => void;
}

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 64;

let toastSeq = 1;

export const useUi = create<UiState>()((set, get) => ({
  screen: 'home',
  packMode: 'game',
  dialog: null,
  zoom: 12,
  panX: 0,
  panY: 0,
  showGrid: true,
  gridSize: 8,
  showPixelGrid: false,
  checker: 'transparent',
  checkerColor: '#14131a',
  rightTab: 'color',
  timelineVisible: true,
  timelineHeight: 232,
  leftWidth: 232,
  rightWidth: 296,
  onion: {
    enabled: false,
    previous: 1,
    next: 1,
    opacity: 0.35,
    tintPrevious: '#ff5fd2',
    tintNext: '#38e8ff',
  },
  playing: false,
  playMode: 'forward',
  fps: 8,
  loop: true,
  previewOpen: false,
  previewScale: 4,
  mobilePanel: 'none',
  toasts: [],
  assistantHighlights: [],
  showOpeningHelp: false,
  openingOpen: false,
  cinemaOpen: false,
  cursor: null,

  setScreen: (screen) => set({ screen, dialog: null }),
  setPackMode: (packMode) => set({ packMode }),
  openDialog: (dialog) => set({ dialog }),
  closeDialog: () => set({ dialog: null }),
  setZoom: (zoom) => set({ zoom: Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom)) }),
  zoomBy: (factor) => set((s) => ({ zoom: Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, s.zoom * factor)) })),
  zoomToFit: (canvasWidth, canvasHeight, viewportW, viewportH) => {
    const padding = 96;
    const scale = Math.min((viewportW - padding) / canvasWidth, (viewportH - padding) / canvasHeight);
    const snapped = scale >= 1 ? Math.max(1, Math.floor(scale)) : Math.max(MIN_ZOOM, Math.round(scale * 100) / 100);
    set({ zoom: Math.min(MAX_ZOOM, snapped), panX: 0, panY: 0 });
  },
  setPan: (panX, panY) => set({ panX, panY }),
  toggleGrid: () => set((s) => ({ showGrid: !s.showGrid })),
  set: (patch) => set(patch),
  setOnion: (patch) => set((s) => ({ onion: { ...s.onion, ...patch } })),
  setPlaying: (playing) => set({ playing }),
  togglePlaying: () => set((s) => ({ playing: !s.playing })),
  pushToast: (message, kind = 'info') => {
    const id = toastSeq++;
    set((s) => ({ toasts: [...s.toasts.slice(-3), { id, message, kind }] }));
    setTimeout(() => get().dismissToast(id), 4200);
  },
  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
  setHighlights: (points) => set({ assistantHighlights: points }),
  setCinemaOpen: (cinemaOpen) => set({ cinemaOpen }),
  setOpeningOpen: (openingOpen) => set({ openingOpen }),
  setMobilePanel: (mobilePanel) => set({ mobilePanel }),
}));
