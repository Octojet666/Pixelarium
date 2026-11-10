import type { SVGProps } from 'react';

export type IconName =
  | 'pencil'
  | 'eraser'
  | 'line'
  | 'rect'
  | 'rect-filled'
  | 'ellipse'
  | 'ellipse-filled'
  | 'bucket'
  | 'eyedropper'
  | 'select'
  | 'lasso'
  | 'move'
  | 'dither'
  | 'spray'
  | 'gradient'
  | 'text'
  | 'shade'
  | 'undo'
  | 'redo'
  | 'save'
  | 'folder'
  | 'download'
  | 'upload'
  | 'play'
  | 'pause'
  | 'prev'
  | 'next'
  | 'first'
  | 'last'
  | 'copy'
  | 'trash'
  | 'eye'
  | 'eye-off'
  | 'lock'
  | 'unlock'
  | 'merge'
  | 'plus'
  | 'minus'
  | 'chevron-left'
  | 'chevron-right'
  | 'chevron-up'
  | 'chevron-down'
  | 'grid'
  | 'settings'
  | 'palette'
  | 'sparkles'
  | 'layers'
  | 'image'
  | 'arrow-left'
  | 'check'
  | 'close'
  | 'zoom-in'
  | 'zoom-out'
  | 'fit'
  | 'loop'
  | 'onion'
  | 'swap'
  | 'tag'
  | 'help'
  | 'grid-map'
  | 'flip-x'
  | 'flip-y'
  | 'rotate'
  | 'film'
  | 'share'
  | 'external'
  | 'cursor'
  | 'book'
  | 'magic'
  | 'shield'
  | 'keyboard'
  | 'target'
  | 'install'
  | 'more';

const PATHS: Record<IconName, string> = {
  pencil: 'M3 13.5 4.6 9.4l7.2-7.2a1.6 1.6 0 0 1 2.3 0l1.7 1.7a1.6 1.6 0 0 1 0 2.3l-7.2 7.2L4.5 15 3 13.5Z M10.4 3.7l3.9 3.9',
  eraser: 'M7.5 14.5 2.9 9.9a1.4 1.4 0 0 1 0-2l5.4-5.4a1.4 1.4 0 0 1 2 0l3.8 3.8a1.4 1.4 0 0 1 0 2L9.9 12.6 M4 10.8l4.3 4.3 M6.5 15h7.2',
  line: 'M3.5 13.5 13.5 3.5',
  rect: 'M3 4.5h11v8H3z',
  'rect-filled': 'M3 4.5h11v8H3z',
  ellipse: 'M13 8.5a5 4 0 0 1-10 0 5 4 0 0 1 10 0Z',
  'ellipse-filled': 'M13 8.5a5 4 0 0 1-10 0 5 4 0 0 1 10 0Z',
  bucket: 'M7 2.5 2.6 7a1.3 1.3 0 0 0 0 1.9l4 4a1.3 1.3 0 0 0 1.9 0l4.4-4.4L7 2.5Z M4.2 6.6h8.5 M13.4 10.6c.7 1.2 1.1 2 1.1 2.5a1.5 1.5 0 0 1-3 0c0-.5.4-1.3 1.1-2.5Z',
  eyedropper: 'M11.8 2.4a1.9 1.9 0 0 1 2.7 2.7l-1.4 1.4 1 1-1.3 1.3-1-1-5.4 5.4-2.9.8.8-2.9 5.4-5.4-1-1L10.5 3.8l1 1 .3-.4Z',
  select: 'M2.8 3h10.4v10H2.8z M2.8 6.2h1.4 M2.8 9.4h1.4 M12 6.2h1.2 M12 9.4h1.2 M5.6 2.9v1.2 M8.6 2.9v1.2 M5.6 12.9v-1.2 M8.6 12.9v-1.2',
  lasso: 'M8 2.8c3.2 0 5.4 1.9 5.4 4.1S11.2 11 8 11c-2 0-3.7-.7-4.6-1.8 M3.3 9.6c-.7 1.1-.4 2.6.7 3.3 M4.4 13.2a1 1 0 1 0 1.4-1.4 1 1 0 0 0-1.4 1.4Z',
  move: 'M8 2v12 M2 8h12 M8 2 6 4 M8 2l2 2 M8 14l-2-2 M8 14l2-2 M2 8l2-2 M2 8l2 2 M14 8l-2-2 M14 8l-2 2',
  dither: 'M3 3h2v2H3z M7 3h2v2H7z M11 3h2v2h-2z M5 5h2v2H5z M9 5h2v2H9z M13 5h2v2h-2z M3 7h2v2H3z M7 7h2v2H7z M11 7h2v2h-2z M5 9h2v2H5z M9 9h2v2H9z M13 9h2v2h-2z M3 11h2v2H3z M7 11h2v2H7z M11 11h2v2h-2z',
  spray: 'M8 6.5v6 M5.5 9.5h5 M11.5 3.5h1 M13.5 5.5h1 M11.5 7.5h1 M3 12.5h1 M2.5 9.5h1 M6 12.5h1',
  gradient: 'M3 3h11v10H3z M5 5h7v2H5z M5 8h5v1.5H5z',
  text: 'M3 3.5h10 M8 3.5v10 M5.5 13.5h5',
  shade: 'M8 2a6 6 0 0 1 0 12Z M8 2a6 6 0 0 0 0 12',
  undo: 'M6 4 3 7l3 3 M3 7h6.2a3.8 3.8 0 0 1 0 7.6H6',
  redo: 'M10 4l3 3-3 3 M13 7H6.8a3.8 3.8 0 0 0 0 7.6H10',
  save: 'M3 3h8.5L14 5.5V13H3V3Z M5.5 3v4h5V3 M5.5 13v-3.5h5V13',
  folder: 'M2.5 4h4l1.2 1.5H13.5V13h-11z',
  download: 'M8 2.5v7 M5 7l3 3 3-3 M3 13h10',
  upload: 'M8 10V3 M5 5.5 8 2.5l3 3 M3 13h10',
  play: 'M5 3.5 12.5 8 5 12.5z',
  pause: 'M5 3.5v9 M10.5 3.5v9',
  prev: 'M11.5 3.7 5.5 8l6 4.3z M4 3.5v9',
  next: 'M4.5 3.7 10.5 8l-6 4.3z M12 3.5v9',
  first: 'M3 3.5v9 M12.5 3.7 6.5 8l6 4.3z',
  last: 'M13 3.5v9 M3.5 3.7 9.5 8l-6 4.3z',
  copy: 'M5.5 5.5H13V13H5.5z M3 10.5V3h7.5',
  trash: 'M2.8 4.5h10.4 M6 4.5V3h4v1.5 M4.2 4.5 5 13.5h6l.8-9 M6.6 7v4 M9.4 7v4',
  eye: 'M1.8 8S4.2 3.9 8 3.9 14.2 8 14.2 8 11.8 12.1 8 12.1 1.8 8 1.8 8Z M9.8 8a1.8 1.8 0 1 1-3.6 0 1.8 1.8 0 0 1 3.6 0Z',
  'eye-off': 'M2 2l12 12 M4.2 5.2C2.4 6.6 1.8 8 1.8 8S4.2 12.1 8 12.1c1 0 1.9-.3 2.7-.7 M7 4.1A6.6 6.6 0 0 1 8 3.9C11.8 3.9 14.2 8 14.2 8s-.8 1.5-2.2 2.7',
  lock: 'M4.5 7.5h7V13h-7z M6 7.5V5.4a2 2 0 0 1 4 0v2.1',
  unlock: 'M4.5 7.5h7V13h-7z M6 7.5V5.4a2 2 0 0 1 3.7-1',
  merge: 'M8 2v6 M5 5.5 8 8.5l3-3 M3 13h10',
  plus: 'M8 3v10 M3 8h10',
  minus: 'M3 8h10',
  'chevron-left': 'M10 3.5 5.5 8l4.5 4.5',
  'chevron-right': 'M6 3.5 10.5 8 6 12.5',
  'chevron-up': 'M3.5 10 8 5.5 12.5 10',
  'chevron-down': 'M3.5 6 8 10.5 12.5 6',
  grid: 'M2.5 2.5h11v11h-11z M2.5 6.2h11 M2.5 9.9h11 M6.2 2.5v11 M9.9 2.5v11',
  settings: 'M8 5.6A2.4 2.4 0 1 1 8 10.4 2.4 2.4 0 0 1 8 5.6Z M8 1.8v1.5 M8 12.7v1.5 M2 8h1.5 M12.5 8H14 M3.8 3.8l1 1 M11.2 11.2l1 1 M12.2 3.8l-1 1 M4.8 11.2l-1 1',
  palette: 'M8 2.2c3.3 0 5.8 2.2 5.8 4.8 0 1.7-1.2 2.3-2.4 2.3h-1c-.8 0-1.4.5-1.4 1.2 0 .8.6 1.1.6 1.9 0 .8-.7 1.4-1.6 1.4-3.2 0-5.8-2.6-5.8-5.8S4.7 2.2 8 2.2Z M5.5 5.4h.01 M9.8 4.6h.01 M11.6 7.4h.01 M4.6 8.8h.01',
  sparkles: 'M6.5 2.5 7.7 6l3.5 1.2L7.7 8.4 6.5 12 5.3 8.4 1.8 7.2 5.3 6z M12 9.5l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7z',
  layers: 'M8 2 2 5.4l6 3.4 6-3.4z M2 8.6 8 12l6-3.4 M2 11.6 8 15l6-3.4',
  image: 'M2.5 3h11v10h-11z M2.5 10.5 6 7l3 3 2-2 2.5 2.5 M10.8 5.6a.9.9 0 1 1-1.8 0 .9.9 0 0 1 1.8 0Z',
  'arrow-left': 'M13 8H3 M7 4 3 8l4 4',
  check: 'M2.5 8.5 6 12l7.5-8',
  close: 'M3.5 3.5l9 9 M12.5 3.5l-9 9',
  'zoom-in': 'M7 2.5a4.5 4.5 0 1 1 0 9 4.5 4.5 0 0 1 0-9Z M10.5 10.5 14 14 M7 5v4 M5 7h4',
  'zoom-out': 'M7 2.5a4.5 4.5 0 1 1 0 9 4.5 4.5 0 0 1 0-9Z M10.5 10.5 14 14 M5 7h4',
  fit: 'M3 6V3h3 M10 3h3v3 M13 10v3h-3 M6 13H3v-3',
  loop: 'M5 3.5h6a3 3 0 0 1 3 3v2 M13 8l-1.6-2 M13 8h-2.2 M11 12.5H5a3 3 0 0 1-3-3v-2 M3 8l1.6 2 M3 8h2.2',
  onion: 'M8 2c2.4 0 4.2 2.4 4.2 6s-1.8 6-4.2 6-4.2-2.4-4.2-6S5.6 2 8 2Z M8 2v12 M4.4 6.5h7.2 M4.2 9.5h7.6',
  swap: 'M3 5.5h8 M8.5 3 11 5.5 8.5 8 M13 10.5H5 M7.5 8 5 10.5 7.5 13',
  tag: 'M2.5 2.5h6l5 5-6 6-5-5z M5.4 5.4h.01',
  help: 'M8 14a6 6 0 1 1 0-12 6 6 0 0 1 0 12Z M6.2 6.2a1.8 1.8 0 1 1 2.7 1.6c-.6.4-.9.7-.9 1.4 M8 11.3h.01',
  'grid-map': 'M2.5 2.5h11v11h-11z M2.5 6h11 M2.5 9.5h11 M6 2.5v11 M9.5 2.5v11 M2.5 2.5l11 11',
  'flip-x': 'M8 2v12 M6 4 2.5 8 6 12 M10 4l3.5 4-3.5 4',
  'flip-y': 'M2 8h12 M4 6 8 2.5 12 6 M4 10l4 3.5 4-3.5',
  rotate: 'M12.5 8a4.5 4.5 0 1 1-1.6-3.4 M12.5 2.5v3h-3',
  film: 'M2.5 3.5h11v9h-11z M5 3.5v9 M11 3.5v9 M2.5 6.2h2.5 M2.5 9.8h2.5 M11 6.2h2.5 M11 9.8h2.5',
  share: 'M6 9.5 10 5.5 M6.5 4.5a2 2 0 1 0-1.5 3.3 2 2 0 0 0 1.5-.7 M9.5 9.2a2 2 0 1 0 1.5.7 2 2 0 0 0-1.5-.7Z',
  external: 'M9 3h4v4 M13 3 7.5 8.5 M11.5 10v3.5h-9V4.5H6',
  cursor: 'M3.5 2.5 12 8l-3.4.7-1.3 3.3z',
  book: 'M2.5 3.5h4.2c.9 0 1.3.4 1.3 1.2V13c0-.8-.4-1.2-1.3-1.2H2.5z M13.5 3.5H9.3c-.9 0-1.3.4-1.3 1.2V13c0-.8.4-1.2 1.3-1.2h4.2z',
  magic: 'M3 13 11 5 M11.5 3.5h2v2 M2.8 5.2h.01 M5 2.8h.01 M3.4 9.6h.01 M9.6 12.6h.01 M12.4 9.4h.01',
  shield: 'M8 2 13 4v4.2c0 3.1-2 5.2-5 6-3-.8-5-2.9-5-6V4z M5.8 7.8 7.4 9.4l2.8-2.8',
  keyboard: 'M2 4.5h12v7H2z M4.5 6.8h.01 M6.8 6.8h.01 M9.1 6.8h.01 M11.4 6.8h.01 M5.5 9.6h5',
  install: 'M2.5 3h11v10h-11z M2.5 5.8h11 M8 7.6v4.6 M6.2 10.4 8 12.2l1.8-1.8',
  target: 'M8 2.5a5.5 5.5 0 1 1 0 11 5.5 5.5 0 0 1 0-11Z M8 6a2 2 0 1 1 0 4 2 2 0 0 1 0-4Z M8 1v2 M8 13v2 M1 8h2 M13 8h2',
  more: 'M3.5 8h.01 M8 8h.01 M12.5 8h.01',
};

export interface IconProps extends Omit<SVGProps<SVGSVGElement>, 'name'> {
  name: IconName;
  size?: number;
}

export function Icon({ name, size = 16, ...rest }: IconProps) {
  const filled = name === 'rect-filled' || name === 'ellipse-filled' || name === 'play' || name === 'prev' || name === 'next' || name === 'first' || name === 'last';
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill={filled ? 'currentColor' : 'none'}
      stroke={filled ? 'none' : 'currentColor'}
      strokeWidth={1.4}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      <path d={PATHS[name]} />
    </svg>
  );
}

export function BrandMark({ size = 28 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      shapeRendering="crispEdges"
      aria-hidden="true"
      className="brand-mark"
    >
      <rect width="32" height="32" rx="7" fill="#121019" />
      <rect x="6" y="6" width="8" height="8" fill="#f5b942" />
      <rect x="14" y="6" width="6" height="6" fill="#ff7a59" />
      <rect x="20" y="12" width="6" height="6" fill="#b06cff" />
      <rect x="12" y="16" width="8" height="8" fill="#4fd1e0" />
      <rect x="6" y="20" width="6" height="6" fill="#8d8aa3" />
      <rect x="20" y="20" width="6" height="6" fill="#2a2736" />
    </svg>
  );
}
