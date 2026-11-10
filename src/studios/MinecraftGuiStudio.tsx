import { useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '../components/Icon';
import { Segmented, Slider } from '../components/Controls';
import { PageNav } from '../screens/PageNav';
import {
  COLUMNS,
  emptySlot,
  layoutFilename,
  menuSize,
  sampleLayout,
  toDeluxeMenusYaml,
  toItemsAdderYaml,
  toOraxenYaml,
  toSlotMapJson,
  validateLayout,
  type GuiLayout,
  type GuiSlot,
} from '../engine/mcGui';
import {
  GUI_THEMES,
  defaultTextureOptions,
  guiTextureFilename,
  paintGuiTexture,
  slotAtPoint,
  slotRectIn,
  themeById,
  type GuiTextureOptions,
} from '../engine/guiTexture';
import { createProject } from '../engine/document';
import { canvasToBlob, downloadBlob } from '../editor/exporting';
import { useEditor } from '../store/project';
import { useUi } from '../store/ui';

/** Display zoom for the texture canvas. */
const SCALE = 4;

type Mode = 'texture' | 'layout';

const MATERIALS = [
  'DIAMOND', 'EMERALD', 'GOLD_INGOT', 'IRON_INGOT', 'NETHERITE_INGOT', 'COAL', 'REDSTONE',
  'GOLDEN_APPLE', 'ARROW', 'PAPER', 'BOOK', 'CHEST', 'ENDER_PEARL', 'NETHER_STAR', 'BARRIER',
  'CLOCK', 'COMPASS', 'ANVIL', 'CRAFTING_TABLE', 'ENCHANTED_BOOK', 'NAME_TAG', 'TOTEM_OF_UNDYING',
];

/**
 * 5×5 item silhouettes.
 *
 * The layout preview cannot ship vanilla textures, but two letters in a coloured box say nothing about
 * the item. A deterministic glyph reads as a gem, an ingot, a potion or a block at slot size.
 * '.' is empty, '1' the body, '2' the highlight.
 */
const GLYPH_SHAPES: string[][] = [
  ['..1..', '.121.', '12221', '.121.', '..1..'],
  ['.....', '.222.', '21112', '.211.', '..1..'],
  ['..2..', '..1..', '.111.', '.111.', '.111.'],
  ['..1..', '.121.', '11111', '.121.', '..1..'],
  ['11111', '12221', '12121', '12221', '11111'],
  ['.111.', '11211', '11211', '11211', '.111.'],
];

/** Materials whose name says what shape they are, so the stand-in glyph matches the item. */
const GLYPH_HINTS: [RegExp, number][] = [
  [/DIAMOND|EMERALD|AMETHYST|PRISMARINE|SHARD/, 0],
  [/INGOT|NUGGET|BRICK|COAL|REDSTONE|LAPIS|QUARTZ|FLINT|SCRAP/, 1],
  [/POTION|BOTTLE|HONEY|BREW/, 2],
  [/STAR|PEARL|COMPASS|CLOCK|TOTEM|TAG|PAPER|BOOK|MAP|ARROW|SHIELD/, 3],
  [/BLOCK|CHEST|BARREL|TABLE|STONE|LOG|PLANK|SPONGE|WOOL/, 4],
  [/APPLE|BREAD|CARROT|BEEF|PORK|COD|SALMON|CAKE|COOKIE|MELON|BERRY/, 5],
];

function glyphIndexFor(material: string, seed: number): number {
  const hint = GLYPH_HINTS.find(([pattern]) => pattern.test(material));
  return hint ? hint[1] : seed % GLYPH_SHAPES.length;
}

/** Small hash so a material always gets the same glyph and hue. */
function materialSeed(material: string): number {
  let hash = 0;
  for (const ch of material) hash = (hash * 31 + ch.charCodeAt(0)) % 100000;
  return hash;
}

/** Draws a pixel texture into a canvas at an integer scale. */
function textureToCanvas(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  scale: number,
): HTMLCanvasElement | null {
  const source = document.createElement('canvas');
  source.width = width;
  source.height = height;
  const sourceCtx = source.getContext('2d');
  if (!sourceCtx) return null;
  const image = sourceCtx.createImageData(width, height);
  image.data.set(pixels);
  sourceCtx.putImageData(image, 0, 0);

  const out = document.createElement('canvas');
  out.width = width * scale;
  out.height = height * scale;
  const ctx = out.getContext('2d');
  if (!ctx) return null;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(source, 0, 0, out.width, out.height);
  return out;
}

/** The item editor for one slot; a separate component so its inputs keep their own focus. */
function SlotEditor({
  slot,
  onChange,
  onRemove,
}: {
  slot: GuiSlot;
  onChange: (patch: Partial<GuiSlot>) => void;
  onRemove: () => void;
}) {
  return (
    <div className="gui-slot-editor">
      <div className="gui-field-row">
        <label className="gui-label" htmlFor="gui-material">Material</label>
        <input
          id="gui-material"
          className="input mono"
          list="mc-materials"
          value={slot.material}
          onChange={(e) => onChange({ material: e.target.value.toUpperCase() })}
          spellCheck={false}
        />
      </div>
      <div className="gui-field-row">
        <label className="gui-label" htmlFor="gui-name">Name</label>
        <input
          id="gui-name"
          className="input"
          value={slot.name}
          onChange={(e) => onChange({ name: e.target.value })}
          placeholder="&bDisplay name"
        />
      </div>
      <div className="gui-field-row">
        <label className="gui-label" htmlFor="gui-amount">Amount</label>
        <input
          id="gui-amount"
          className="input mono"
          type="number"
          min={1}
          max={64}
          value={slot.amount}
          onChange={(e) => onChange({ amount: Math.max(1, Math.min(64, Number(e.target.value) || 1)) })}
        />
      </div>
      <div className="gui-field-row gui-field-stack">
        <label className="gui-label" htmlFor="gui-lore">Lore (one line each)</label>
        <textarea
          id="gui-lore"
          className="input gui-textarea"
          value={slot.lore.join('\n')}
          onChange={(e) => onChange({ lore: e.target.value.split('\n').slice(0, 12) })}
          placeholder="&7Description"
          rows={3}
        />
      </div>
      <div className="gui-field-row">
        <label className="gui-label" htmlFor="gui-action">Left click</label>
        <input
          id="gui-action"
          className="input mono"
          value={slot.action}
          onChange={(e) => onChange({ action: e.target.value })}
          placeholder="shop buy diamond  ·  close"
        />
      </div>
      <button className="btn sm ghost" onClick={onRemove}>
        <Icon name="trash" size={12} /> Clear slot
      </button>
    </div>
  );
}

export function MinecraftGuiStudio() {
  const doc = useEditor((s) => s.doc);
  const setGuiLayout = useEditor((s) => s.setGuiLayout);
  const setGuiTexture = useEditor((s) => s.setGuiTexture);
  const loadDocument = useEditor((s) => s.loadDocument);
  const setScreen = useUi((s) => s.setScreen);
  const pushToast = useUi((s) => s.pushToast);

  const [mode, setMode] = useState<Mode>('texture');
  const [layout, setLayout] = useState<GuiLayout>(() => doc.gui ?? sampleLayout());
  const [texture, setTexture] = useState<GuiTextureOptions>(() => doc.guiTexture ?? defaultTextureOptions());
  const [selected, setSelected] = useState<number | null>(null);
  const [layoutDirty, setLayoutDirty] = useState(false);
  const [textureDirty, setTextureDirty] = useState(false);
  const [exportScale, setExportScale] = useState(1);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  /* A different project means a different menu. */
  useEffect(() => {
    setLayout(doc.gui ?? sampleLayout());
    setLayoutDirty(false);
    setSelected(null);
  }, [doc.id, doc.gui]);

  useEffect(() => {
    setTexture(doc.guiTexture ?? defaultTextureOptions());
    setTextureDirty(false);
  }, [doc.id, doc.guiTexture]);

  const problems = useMemo(() => validateLayout(layout), [layout]);
  const size = menuSize(layout.rows);
  const texturePaint = useMemo(() => paintGuiTexture(layout, texture), [layout, texture]);
  const metrics = texturePaint.metrics;
  const theme = themeById(texture.theme);
  const dirty = layoutDirty || textureDirty;

  const updateLayout = (patch: Partial<GuiLayout>) => {
    setLayout((current) => ({ ...current, ...patch }));
    setLayoutDirty(true);
  };

  const updateTexture = (patch: Partial<GuiTextureOptions>) => {
    setTexture((current) => ({ ...current, ...patch }));
    setTextureDirty(true);
  };

  const save = () => {
    if (layoutDirty) setGuiLayout(layout);
    if (textureDirty) setGuiTexture(texture);
    setLayoutDirty(false);
    setTextureDirty(false);
    pushToast('Menu layout and texture saved in the project.', 'success');
  };

  const slotAt = (index: number) => layout.slots.find((slot) => slot.index === index) ?? null;

  const setSlot = (index: number, patch: Partial<GuiSlot>) => {
    setLayout((current) => {
      const existing = current.slots.find((slot) => slot.index === index);
      const slots = existing
        ? current.slots.map((slot) => (slot.index === index ? { ...slot, ...patch } : slot))
        : [...current.slots, emptySlot(index, patch)];
      return { ...current, slots };
    });
    setLayoutDirty(true);
  };

  const removeSlot = (index: number) => {
    setLayout((current) => ({ ...current, slots: current.slots.filter((slot) => slot.index !== index) }));
    setLayoutDirty(true);
  };

  /* Preview: the generated texture, plus item glyphs and the selected slot in layout mode. */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    if (canvas.width !== metrics.width * SCALE || canvas.height !== metrics.height * SCALE) {
      canvas.width = metrics.width * SCALE;
      canvas.height = metrics.height * SCALE;
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.imageSmoothingEnabled = false;
    const source = textureToCanvas(texturePaint.pixels, metrics.width, metrics.height, SCALE);
    if (!source) return;
    ctx.drawImage(source, 0, 0);

    if (mode !== 'layout') return;

    for (const slot of layout.slots) {
      if (slot.index < 0 || slot.index >= size) continue;
      const rect = slotRectIn(metrics, slot.index);
      const innerX = (rect.x + 1) * SCALE;
      const innerY = (rect.y + 1) * SCALE;
      const innerW = (rect.w - 2) * SCALE;
      const seed = materialSeed(slot.material);
      const glyph = GLYPH_SHAPES[glyphIndexFor(slot.material, seed)];
      const hue = seed % 360;
      // Whole-pixel cells keep the glyph crisp at any display zoom.
      const cell = Math.max(2, Math.floor(innerW / 7));
      const glyphW = cell * 5;
      const glyphX = innerX + Math.floor((innerW - glyphW) / 2);
      const glyphY = innerY + Math.floor((innerW - glyphW) / 2);

      ctx.fillStyle = `hsla(${hue}, 45%, 32%, 0.5)`;
      ctx.fillRect(glyphX - cell, glyphY - cell, glyphW + cell * 2, glyphW + cell * 2);
      for (let gy = 0; gy < 5; gy++) {
        for (let gx = 0; gx < 5; gx++) {
          const mark = glyph[gy][gx];
          if (mark === '.') continue;
          ctx.fillStyle = mark === '2' ? `hsl(${hue} 70% 72%)` : `hsl(${hue} 55% 52%)`;
          ctx.fillRect(glyphX + gx * cell, glyphY + gy * cell, cell, cell);
        }
      }

      if (slot.amount > 1) {
        ctx.fillStyle = 'rgba(255,255,255,0.95)';
        ctx.font = `bold ${SCALE * 3}px ui-monospace, monospace`;
        ctx.textAlign = 'right';
        ctx.textBaseline = 'bottom';
        ctx.fillText(String(slot.amount), (rect.x + rect.w - 2) * SCALE, (rect.y + rect.h - 1) * SCALE);
      }
    }

    if (selected !== null && selected < size) {
      const rect = slotRectIn(metrics, selected);
      ctx.strokeStyle = '#f5b942';
      ctx.lineWidth = 3;
      ctx.strokeRect(rect.x * SCALE + 1.5, rect.y * SCALE + 1.5, rect.w * SCALE - 3, rect.h * SCALE - 3);
    }
  }, [mode, layout, texturePaint, metrics, selected, size]);

  const onCanvasClick = (event: React.MouseEvent<HTMLCanvasElement>) => {
    if (mode !== 'layout') return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * metrics.width;
    const y = ((event.clientY - rect.top) / rect.height) * metrics.height;
    const index = slotAtPoint(metrics, x, y);
    if (index === null || index >= size) return;
    setSelected(index);
    if (!slotAt(index)) setSlot(index, { index });
  };

  const download = (name: string, text: string, type: string) => {
    save();
    downloadBlob(new Blob([text], { type }), name);
    pushToast(`Exported ${name}.`, 'success');
  };

  const exportTexture = async () => {
    save();
    const pixels = paintGuiTexture(layout, texture);
    const canvas = textureToCanvas(pixels.pixels, pixels.width, pixels.height, exportScale);
    if (!canvas) return;
    downloadBlob(await canvasToBlob(canvas), `${guiTextureFilename(layout)}_${exportScale}x.png`);
    pushToast(`Exported ${canvas.width}×${canvas.height} GUI texture.`, 'success');
  };

  /** Bakes the generated texture into a real project, so details can be hand-painted in the editor. */
  const paintInEditor = () => {
    const pixels = paintGuiTexture(layout, texture);
    const project = createProject({
      name: `${layout.name} texture`,
      width: pixels.width,
      height: pixels.height,
    });
    project.layers[0].name = 'Texture';
    project.frames[0].cels[project.layers[0].id].set(pixels.pixels);
    project.gui = { ...layout };
    project.guiTexture = { ...texture };
    loadDocument(project);
    setScreen('editor');
    pushToast('GUI texture opened as a pixel project — paint details on top.', 'success');
  };

  const stem = layoutFilename(layout);
  const deluxeMenus = toDeluxeMenusYaml(layout);
  const currentSlot = selected !== null ? slotAt(selected) : null;

  return (
    <div className="page-shell">
      <div className="page-inner">
        <PageNav />

        <div className="studio-workspace-head">
          <div>
            <button className="studio-back" onClick={() => setScreen('studios')}>
              <Icon name="arrow-left" size={12} /> Studios
            </button>
            <h1 className="studio-title">Minecraft GUI Studio</h1>
            <p className="studio-sub">
              {doc.name} · {theme.name} texture · {layout.rows} rows · {metrics.width}×{metrics.height} px
              {dirty && <span className="studio-dirty">unsaved menu changes</span>}
            </p>
          </div>
          <div className="studio-head-actions">
            <Segmented
              options={[
                { value: 'texture' as Mode, label: 'Texture' },
                { value: 'layout' as Mode, label: 'Items' },
              ]}
              value={mode}
              onChange={setMode}
            />
            <button className="btn sm primary" onClick={save} disabled={!dirty}>
              <Icon name="check" size={13} /> Save menu
            </button>
          </div>
        </div>

        {mode === 'texture' ? (
          <div className="studio-split">
            <section className="studio-main">
              <div className="gui-canvas-wrap">
                <canvas
                  ref={canvasRef}
                  width={metrics.width * SCALE}
                  height={metrics.height * SCALE}
                  className="gui-canvas texture"
                  aria-label="Generated GUI texture preview"
                />
              </div>
              <p className="studio-hint">
                The whole panel is painted from the theme: frame, ribbon, slot wells and corner plates. Export the PNG
                for a resource pack or plugin GUI, or bake it into a pixel project and hand-paint details such as icons,
                banners and artwork.
              </p>

              <div className="studio-panel">
                <h3>Theme</h3>
                <div className="gui-theme-grid">
                  {GUI_THEMES.map((option) => (
                    <button
                      key={option.id}
                      className={`gui-theme${option.id === texture.theme ? ' active' : ''}`}
                      onClick={() => updateTexture({ theme: option.id })}
                      title={option.blurb}
                    >
                      <span className="gui-theme-swatch" aria-hidden="true">
                        <i style={{ background: option.frame }} />
                        <i style={{ background: option.face }} />
                        <i style={{ background: option.well }} />
                        <i style={{ background: option.accent }} />
                      </span>
                      <span className="gui-theme-name">{option.name}</span>
                    </button>
                  ))}
                </div>
                <p className="studio-hint">{theme.blurb}</p>
              </div>

              <div className="studio-panel">
                <h3>Menu shape</h3>
                <div className="gui-field-row">
                  <label className="gui-label" htmlFor="gui-rows-texture">Rows</label>
                  <select
                    id="gui-rows-texture"
                    className="select"
                    value={layout.rows}
                    onChange={(e) => updateLayout({ rows: Number(e.target.value) })}
                  >
                    {[1, 2, 3, 4, 5, 6].map((rows) => (
                      <option key={rows} value={rows}>
                        {rows} · {rows * COLUMNS} slots · {COLUMNS * 18}×{rows * 18 + 16} px
                      </option>
                    ))}
                  </select>
                </div>
                <div className="gui-field-row">
                  <label className="gui-label" htmlFor="gui-title-texture">Ribbon text</label>
                  <input
                    id="gui-title-texture"
                    className="input mono"
                    value={layout.title}
                    onChange={(e) => updateLayout({ title: e.target.value })}
                    placeholder="&8Marketplace"
                  />
                </div>
                <p className="studio-hint">
                  Colour codes like <code>&amp;8</code> are stripped before the title is drawn at 5×7 px.
                </p>
              </div>
            </section>

            <aside className="studio-side">
              <div className="studio-panel">
                <h3>Panel</h3>
                <label className="hstack" style={{ gap: 8 }}>
                  <input
                    type="checkbox"
                    checked={texture.header}
                    onChange={(e) => updateTexture({ header: e.target.checked })}
                  />
                  <span>Title ribbon</span>
                </label>
                <label className="hstack" style={{ gap: 8 }}>
                  <input
                    type="checkbox"
                    checked={texture.wells}
                    onChange={(e) => updateTexture({ wells: e.target.checked })}
                  />
                  <span>Recessed slot wells</span>
                </label>
                <label className="hstack" style={{ gap: 8 }}>
                  <input
                    type="checkbox"
                    checked={texture.grain}
                    onChange={(e) => updateTexture({ grain: e.target.checked })}
                  />
                  <span>Material grain</span>
                </label>
                <label className="hstack" style={{ gap: 8 }}>
                  <input
                    type="checkbox"
                    checked={texture.ornaments}
                    onChange={(e) => updateTexture({ ornaments: e.target.checked })}
                  />
                  <span>Corner plates</span>
                </label>
                <Slider
                  label="Frame thickness"
                  value={texture.padding}
                  min={3}
                  max={14}
                  suffix="px"
                  onChange={(padding) => updateTexture({ padding })}
                />
                <div className="gui-field-row">
                  <label className="gui-label" htmlFor="gui-accent">Accent</label>
                  <input
                    id="gui-accent"
                    className="input mono"
                    type="color"
                    value={texture.accent || theme.accent}
                    onChange={(e) => updateTexture({ accent: e.target.value })}
                  />
                  <button
                    className="btn sm ghost"
                    onClick={() => updateTexture({ accent: '' })}
                    disabled={!texture.accent}
                  >
                    Theme
                  </button>
                </div>
              </div>

              <div className="studio-panel">
                <h3>Export</h3>
                <div className="gui-field-row">
                  <label className="gui-label" htmlFor="gui-export-scale">Scale</label>
                  <select
                    id="gui-export-scale"
                    className="select"
                    value={exportScale}
                    onChange={(e) => setExportScale(Number(e.target.value))}
                  >
                    {[1, 2, 4].map((scale) => (
                      <option key={scale} value={scale}>
                        {scale}× · {metrics.width * scale}×{metrics.height * scale}
                      </option>
                    ))}
                  </select>
                </div>
                <button className="btn sm primary" onClick={() => void exportTexture()}>
                  <Icon name="download" size={12} /> GUI texture PNG
                </button>
                <button className="btn sm" onClick={paintInEditor}>
                  <Icon name="pencil" size={12} /> Paint details in editor
                </button>
                <p className="studio-hint">
                  Export at 1× for a resource-pack texture (<code>{guiTextureFilename(layout)}.png</code>), or 2×/4× for
                  screenshots and documentation. Ignores item placement — that lives in Items.
                </p>
              </div>

              <div className="studio-panel">
                <h3>Recipe</h3>
                <div className="stat-line">
                  <span>Frame</span>
                  <b>{texture.padding}px</b>
                </div>
                <div className="stat-line">
                  <span>Ribbon</span>
                  <b>{texture.header ? '13px' : 'off'}</b>
                </div>
                <div className="stat-line">
                  <span>Slots</span>
                  <b>
                    {layout.rows}×9 · 18px
                  </b>
                </div>
                <div className="stat-line">
                  <span>Texture</span>
                  <b>
                    {metrics.width}×{metrics.height}
                  </b>
                </div>
                <p className="studio-hint">
                  A {layout.rows}-row chest needs {(layout.rows + 1) * 18 + 2}px of UI space in Minecraft; the framed
                  texture is larger because it includes the panel border.
                </p>
              </div>
            </aside>
          </div>
        ) : (
          <div className="studio-split">
            <section className="studio-main">
              <div className="gui-canvas-wrap">
                <canvas
                  ref={canvasRef}
                  width={metrics.width * SCALE}
                  height={metrics.height * SCALE}
                  className="gui-canvas"
                  onClick={onCanvasClick}
                  aria-label="Menu preview — click a slot to edit its item"
                />
              </div>
              <p className="studio-hint">
                Click a slot to place an item. The panel behind the items is the texture from the Texture tab; glyphs
                stand in for vanilla item icons.
              </p>

              <div className="gui-grid-tools">
                <label className="gui-label" htmlFor="gui-rows">Rows</label>
                <select
                  id="gui-rows"
                  className="select"
                  value={layout.rows}
                  onChange={(e) => updateLayout({ rows: Number(e.target.value) })}
                >
                  {[1, 2, 3, 4, 5, 6].map((rows) => (
                    <option key={rows} value={rows}>
                      {rows} · {rows * COLUMNS} slots
                    </option>
                  ))}
                </select>
                <span className="spacer" />
                <span className="studio-metric">{layout.slots.length} items placed</span>
              </div>

              <div className="gui-slot-list">
                {[...layout.slots]
                  .sort((a, b) => a.index - b.index)
                  .map((slot) => (
                    <button
                      key={slot.index}
                      className={`gui-slot-chip${slot.index === selected ? ' active' : ''}`}
                      onClick={() => setSelected(slot.index)}
                    >
                      <span className="mono">{slot.index}</span>
                      <span className="gui-slot-material">{slot.material}</span>
                    </button>
                  ))}
                {layout.slots.length === 0 && <span className="studio-metric">No items yet — click a slot.</span>}
              </div>
            </section>

            <aside className="studio-side">
              <div className="studio-panel">
                <h3>Layout</h3>
                <div className="gui-field-row">
                  <label className="gui-label" htmlFor="gui-layout-name">Name</label>
                  <input
                    id="gui-layout-name"
                    className="input"
                    value={layout.name}
                    onChange={(e) => updateLayout({ name: e.target.value })}
                  />
                </div>
                <div className="gui-field-row">
                  <label className="gui-label" htmlFor="gui-title">Menu title</label>
                  <input
                    id="gui-title"
                    className="input mono"
                    value={layout.title}
                    onChange={(e) => updateLayout({ title: e.target.value })}
                    placeholder="&8Shop"
                  />
                </div>
                <div className="gui-field-row">
                  <label className="gui-label" htmlFor="gui-command">Open command</label>
                  <input
                    id="gui-command"
                    className="input mono"
                    value={layout.openCommand}
                    onChange={(e) => updateLayout({ openCommand: e.target.value.toLowerCase() })}
                  />
                </div>
                <div className="gui-field-row">
                  <label className="gui-label" htmlFor="gui-permission">Permission</label>
                  <input
                    id="gui-permission"
                    className="input mono"
                    value={layout.permission}
                    onChange={(e) => updateLayout({ permission: e.target.value })}
                    placeholder="(none)"
                  />
                </div>
                <div className="gui-field-row">
                  <label className="gui-label" htmlFor="gui-namespace">Namespace</label>
                  <input
                    id="gui-namespace"
                    className="input mono"
                    value={layout.namespace}
                    onChange={(e) => updateLayout({ namespace: e.target.value.toLowerCase() })}
                  />
                </div>
              </div>

              <div className="studio-panel">
                <h3>{currentSlot ? `Slot ${currentSlot.index}` : 'Item'}</h3>
                {currentSlot ? (
                  <SlotEditor
                    slot={currentSlot}
                    onChange={(patch) => setSlot(currentSlot.index, patch)}
                    onRemove={() => removeSlot(currentSlot.index)}
                  />
                ) : (
                  <p className="studio-metric">Select a slot in the preview to place an item.</p>
                )}
              </div>

              <div className="studio-panel">
                <h3>Validation</h3>
                {problems.length === 0 ? (
                  <p className="studio-ok">
                    <Icon name="check" size={12} /> No problems — the menu is exportable.
                  </p>
                ) : (
                  <ul className="studio-problems">
                    {problems.slice(0, 8).map((problem, index) => (
                      <li key={`${problem.message}-${index}`}>{problem.message}</li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="studio-panel">
                <h3>Plugin export</h3>
                <div className="studio-export-list">
                  <button className="btn sm" onClick={() => download(`${stem}.yml`, deluxeMenus, 'text/yaml')}>
                    <Icon name="film" size={13} /> DeluxeMenus menu
                  </button>
                  <button
                    className="btn sm"
                    onClick={() => download(`${stem}-itemsadder.yml`, toItemsAdderYaml(layout), 'text/yaml')}
                  >
                    <Icon name="layers" size={13} /> ItemsAdder items
                  </button>
                  <button
                    className="btn sm"
                    onClick={() => download(`${stem}-oraxen.yml`, toOraxenYaml(layout), 'text/yaml')}
                  >
                    <Icon name="layers" size={13} /> Oraxen items
                  </button>
                  <button
                    className="btn sm ghost"
                    onClick={() => download(`${stem}.json`, toSlotMapJson(layout), 'application/json')}
                  >
                    <Icon name="book" size={13} /> Slot map JSON
                  </button>
                </div>
                <pre className="studio-pre">{deluxeMenus.split('\n').slice(0, 14).join('\n')}</pre>
                <p className="studio-hint">
                  Drop the menu file into <code>plugins/DeluxeMenus/gui_menus/</code>; the item files go into the
                  matching ItemsAdder or Oraxen configuration folders.
                </p>
              </div>
            </aside>
          </div>
        )}

        <datalist id="mc-materials">
          {MATERIALS.map((material) => (
            <option key={material} value={material} />
          ))}
        </datalist>
      </div>
    </div>
  );
}
