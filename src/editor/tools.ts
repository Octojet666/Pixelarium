import type { IconName } from '../components/Icon';
import type { ToolId } from '../types';

export interface ToolDef {
  id: ToolId;
  label: string;
  icon: IconName;
  shortcut: string;
  hint: string;
  group: number;
}

export const TOOLS: ToolDef[] = [
  { id: 'pencil', label: 'Pencil', icon: 'pencil', shortcut: 'B', hint: 'Freehand pixel drawing. Right-click uses the secondary color.', group: 0 },
  { id: 'eraser', label: 'Eraser', icon: 'eraser', shortcut: 'E', hint: 'Erase pixels back to transparency.', group: 0 },
  { id: 'line', label: 'Line', icon: 'line', shortcut: 'L', hint: 'Pixel-perfect straight line. Hold Shift to snap the angle.', group: 1 },
  { id: 'rect', label: 'Rectangle', icon: 'rect', shortcut: 'R', hint: 'Rectangle outline. Shift keeps it square.', group: 1 },
  { id: 'rect-filled', label: 'Filled rectangle', icon: 'rect-filled', shortcut: '⇧R', hint: 'Solid rectangle. Shift keeps it square.', group: 1 },
  { id: 'ellipse', label: 'Ellipse', icon: 'ellipse', shortcut: 'O', hint: 'Ellipse outline. Shift keeps it circular.', group: 1 },
  { id: 'ellipse-filled', label: 'Filled ellipse', icon: 'ellipse-filled', shortcut: '⇧E', hint: 'Solid ellipse. Shift keeps it circular.', group: 1 },
  { id: 'bucket', label: 'Paint bucket', icon: 'bucket', shortcut: 'G', hint: 'Flood fill with adjustable tolerance.', group: 2 },
  { id: 'gradient', label: 'Gradient', icon: 'gradient', shortcut: '⇧G', hint: 'Drag a linear or radial gradient from primary to secondary.', group: 2 },
  { id: 'dither', label: 'Dither brush', icon: 'dither', shortcut: 'D', hint: 'Ordered dithering between the primary and secondary colors.', group: 2 },
  { id: 'spray', label: 'Spray', icon: 'spray', shortcut: 'A', hint: 'Scatter pixels with adjustable density.', group: 2 },
  { id: 'shade', label: 'Shade', icon: 'shade', shortcut: '', hint: 'Darken with the left button, lighten with the right.', group: 2 },
  { id: 'eyedropper', label: 'Eyedropper', icon: 'eyedropper', shortcut: 'I', hint: 'Sample a color from the canvas.', group: 3 },
  { id: 'select', label: 'Rectangle select', icon: 'select', shortcut: 'M', hint: 'Select a rectangular region. Drawing stays inside the selection.', group: 3 },
  { id: 'select-free', label: 'Lasso select', icon: 'lasso', shortcut: 'Q', hint: 'Draw a freeform selection outline.', group: 3 },
  { id: 'move', label: 'Move', icon: 'move', shortcut: 'V', hint: 'Move the selection, or the whole layer when nothing is selected.', group: 3 },
  { id: 'text', label: 'Text', icon: 'text', shortcut: 'T', hint: 'Place bitmap text using the built-in 5×7 font.', group: 3 },
];

export const TOOL_BY_ID = new Map(TOOLS.map((t) => [t.id, t]));

export const TOOL_SHORTCUTS = new Map(
  TOOLS.filter((t) => t.shortcut.length === 1).map((t) => [t.shortcut.toLowerCase(), t.id]),
);

export const SHAPE_TOOL_IDS: ToolId[] = ['line', 'rect', 'rect-filled', 'ellipse', 'ellipse-filled', 'gradient'];
