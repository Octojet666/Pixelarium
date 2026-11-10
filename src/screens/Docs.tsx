import { PageNav } from './PageNav';
import { useUi } from '../store/ui';

export function Docs() {
  const setScreen = useUi((s) => s.setScreen);
  return (
    <div className="page-shell">
      <div className="page-inner">
        <PageNav />
        <div className="docs-page">
          <span className="kicker">Studio manual</span>
          <h1>How Pixelarium works</h1>
          <p>
            Pixelarium is a local-first pixel-art studio. The editor, rendering engine, animation timeline and exporters
            all run in your browser; there is no required server. This manual covers the workflow, the file format and
            the honest state of every feature in this build.
          </p>

          <h2 id="start">1. Start a project</h2>
          <p>
            Pick a preset on the library screen or define a custom canvas (1–2048 px per side). Every project begins with
            one transparent layer and one frame. Canvas size can be changed later: <em>Canvas → Resize canvas</em> keeps
            artwork anchored from the center or the top-left corner, and undo restores it.
          </p>
          <p>
            Projects autosave to IndexedDB about a second after each change, and a separate recovery draft is written so
            that an interrupted session can be restored from <em>File → Open project</em>.
          </p>
          <p>
            Any saved project can run in its own browser tab: use the tab icon on a library card, or{' '}
            <em>File → Open in new tab</em>. Each tab keeps its own document, so you can work on several projects at once
            without closing anything. Opening the <em>same</em> project in two tabs is last-save-wins.
          </p>

          <h2 id="drawing">2. Drawing</h2>
          <ul>
            <li><strong>Pencil and eraser</strong> use square or round brushes from 1 to 32 px, with per-stroke opacity.</li>
            <li><strong>Pixel-perfect strokes</strong> remove the doubled L-corner pixels that appear when a freehand line changes direction.</li>
            <li><strong>Shapes</strong> (line, rectangle, ellipse) preview live on the canvas and hold <code>Shift</code> for square, circle or 45° angle constraints.</li>
            <li><strong>Fill</strong> is a tolerance flood fill; <strong>gradient</strong> runs from the primary to the secondary color in linear or radial mode.</li>
            <li><strong>Dither</strong> stamps ordered patterns between both colors; <strong>spray</strong> scatters pixels with adjustable density.</li>
            <li><strong>Symmetry</strong> mirrors strokes horizontally, vertically, or both. Guide lines show the axes.</li>
            <li><strong>Pressure</strong> (pen tablets and phones) can drive brush size, opacity, or both; the eraser tip of a stylus erases without switching tools.</li>
            <li><strong>Custom brushes</strong> include diagonal, cross, star, diamond, horizontal, vertical, sparkle and checker footprints. Select pixels and press <em>+</em> in the brush row to save the selection as a brush; it stays in this browser. Right-click a saved brush to delete it.</li>
            <li><strong>Tile mode</strong> wraps freehand stamps across the canvas edges for seamless tiles, with a 3×3 live preview. Symmetry and tile wrapping can be combined.</li>
            <li><strong>Text</strong> places a hand-authored 5×7 bitmap font at 1–6× scale.</li>
          </ul>
          <p>
            Right-drag paints with the secondary color. Selections clip every painting tool: pixels outside the selection
            are restored after each stroke. The move tool moves the selection mask, or the whole layer when nothing is
            selected.
          </p>

          <h2 id="layers">3. Layers and frames</h2>
          <p>
            Layers are ordered bottom-first in the document and top-first in the panel. Each frame stores one cel per
            layer, so animation is per-layer: a character can walk while the background stays still. Blending modes
            (multiply, screen, overlay, add, subtract, darken, lighten, difference) and opacity apply per layer at
            composite time.
          </p>
          <p>
            The timeline supports add, duplicate, delete, reorder, copy and paste frames, per-frame durations, tags,
            forward/reverse/ping-pong playback and looping. Onion skin renders up to three previous and three next frames
            tinted in the colors you choose.
          </p>

          <h2 id="color">4. Color and palettes</h2>
          <p>
            The color panel combines an HSV field, hue strip and hex entry with a palette made of the project's own
            swatches. Nine curated palettes ship built in: Midnight Arcade, Forgotten Kingdom, Neon Dreams, Autumn
            Memory, Ocean Depths, Retro Hardware, Monochrome Stories, plus Frostbound and Ember Forge.
          </p>
          <ul>
            <li><strong>Extract</strong> builds a palette from the current frame with median-cut quantization.</li>
            <li><strong>Snap</strong> maps every pixel on the active layer to the nearest palette color.</li>
            <li><strong>Indexed color mode</strong> snaps every color you pick to the active palette and keeps stamps opaque, so no blended colors leak in. <em>Remap all</em> snaps every layer of every frame in one undoable step.</li>
            <li><strong>Replace color</strong> swaps one exact color for another on the active layer.</li>
            <li>Palettes import from hex lists, JASC-PAL and GIMP <code>.gpl</code> files, and export as <code>.hex</code>.</li>
          </ul>
          <p>
            The <em>Analyze</em> tab turns the frame into Palette DNA: dominant colors with shares, unique color count,
            contrast range, saturation and warm/cool balance.
          </p>

          <h2 id="lab">5. Playground: generation, dithering, effects</h2>
          <p>
            The procedural generator is deterministic: the same seed and parameters always produce the same artwork.
            Ten generators cover terrain, mountains, clouds, trees, rocks, water, grass, stars, crystals and patterns.
            Results are inserted as ordinary layers, so every pixel stays editable.
          </p>
          <p>
            The dither studio previews ordered (Bayer) and error-diffusion (Floyd–Steinberg) dithering against either the
            project palette or a median-cut palette. Effects include outline, drop shadow, glow, tint, hue shift,
            brightness/contrast, noise, quantize, pixelate and mirror, with a live before/after preview and the option to
            write to a new layer.
          </p>

          <h2 id="tiles">6. Tileset studio</h2>
          <p>
            Create a tileset (8, 16 or 32 px tiles) with six starter tiles derived from the active palette, paint a
            tilemap with snapped brush strokes, resize the map, then export three files together: the map PNG, the tileset
            PNG it references and a Tiled map JSON (<code>type: "map"</code>, orthogonal, one tile layer with firstgid 1)
            that opens directly in Tiled. Map data is stored in the project and preserved in <code>.pxl</code> files.
          </p>

          <h2 id="export">7. Export</h2>
          <ul>
            <li><strong>PNG</strong> at 1–16× nearest-neighbour scale, transparent or on a solid background, single frame or every frame.</li>
            <li><strong>Sprite sheet</strong> with configurable columns, padding, spacing and scale, plus frame metadata as Pixelarium's pack manifest, <strong>Aseprite JSON</strong> (<code>frames</code> hash and <code>meta.frameTags</code>) or <strong>TexturePacker JSON</strong> (array frames and <code>animations</code> for Phaser and other atlas loaders).</li>
            <li><strong>Animated GIF</strong> encoded by the built-in GIF89a encoder (LZW compression, transparency, per-frame delays, median-cut or project palette).</li>
            <li><strong>.pxl</strong> project files preserve layers, cels, frames, durations, palettes, tags, tilemaps and metadata.</li>
          </ul>
          <p>
            <strong>Share links</strong> are another export path: <em>File → Copy share link</em> compresses the whole project
            into the URL itself (no upload, no account). Anyone who opens it gets an editable copy in their own library.
            Normal sprites produce links of a few kilobytes; if a project is too large for a URL, Pixelarium tells you to
            send a <code>.pxl</code> file instead of handing you a truncated link.
          </p>
          <div className="callout">
            GIF is a 256-color format; the exporter quantizes colors and can dither. Files are generated in the browser and
            downloaded directly — no upload step exists.
          </div>

          <h2 id="format">8. Project format</h2>
          <p>
            A <code>.pxl</code> file is UTF-8 JSON. Cel pixels are base64-encoded RGBA bytes, decoded and validated against
            the canvas size on open. Unknown or damaged cels are repaired to empty ones rather than discarding the project.
            The schema is documented in the repository at <code>docs/PROJECT_FORMAT.md</code>.
          </p>
          <pre>
            <code>{`{
  "format": "pixelarium",
  "version": 1,
  "document": {
    "width": 64, "height": 64,
    "layers": [{ "id": "layer-…", "name": "Sky", "opacity": 255, "blend": "normal" }],
    "frames": [{ "duration": 260, "cels": { "layer-…": "<base64 RGBA>" } }]
  }
}`}</code>
          </pre>

          <p>
            <strong>Nine-slice</strong> (<em>File → Nine-slice preview</em>) saves four edge insets with the project, draws
            them as amber guides on the canvas, and previews the artwork stretched to any target size. Corners stay
            pixel-exact while edges and the centre stretch, and the preview downloads as a PNG for UI work.
          </p>

          <h2 id="install">9. Browser or app</h2>
          <p>
            Pixelarium is one codebase with two ways to open it. In the browser it is a normal site. It also ships a web app
            manifest and a service worker, so it can be installed as a standalone app with its own window, icon and
            offline app shell. Chrome and Edge offer <em>Install</em> in the address bar or the app menu; Safari on macOS
            uses <em>Share → Add to Dock</em>; iOS and Android use <em>Add to Home Screen</em>. The editor's top bar and
            Settings show an Install action whenever the browser exposes the prompt.
          </p>
          <p>
            Installed and browser versions of the same origin share the same IndexedDB projects. Different origins (for
            example <code>localhost:5173</code> during development and a deployed site) are separate browser stores, so use
            <code>.pxl</code> export/import to move work between them. The first online visit caches the app shell; after
            that the editor, drawing engine and local project library load without a network, and only network features
            (not part of this build) would need one.
          </p>
          <p>
            On a phone or a narrow window the editor becomes touch-first: the canvas fills the width, the top bar wraps so
            Save and Export stay reachable, and a bottom dock opens <em>Tool</em>, <em>Colour</em>, <em>Layers</em> and
            <em>Frames</em> as a sheet. Pinch with two fingers to zoom and drag with two fingers to pan; a single finger
            draws (it waits for movement, so a second finger turns the gesture into a pinch instead of leaving a dot).
          </p>
          <p>
            <strong>Multiple tabs</strong> are supported: use the arrow on any library card or <em>File → Open in new tab</em>.
            Each tab holds its own project, so you can keep a character and a tileset open side by side. Tabs save per
            project; the same project open twice is last-save-wins.
          </p>

          <h2 id="cinema">10. Cinematic camera and video</h2>
          <p>
            The film button in the editor toolbar opens the cinematic camera. It frames the same animation as a fixed-size
            scene (16:9, 9:16, 1:1, 4:3 or the canvas ratio) with contain or cover fitting and a scene background. Camera
            keys live on animation frames: set a position and zoom on one frame, another on a later frame, and the camera
            eases between them across every frame in between. Frames before the first key hold its framing; playback loops
            the whole animation.
          </p>
          <ul>
            <li><strong>Key this frame</strong> stores the current camera as a keyframe (shown as a dot under the frame and an amber “keyed” badge).</li>
            <li><strong>Key all frames</strong> copies one pose to every frame for a static shot; <strong>Remove key</strong> and <strong>Reset</strong> undo the framing.</li>
            <li><strong>Export video</strong> records the camera view in real time with the browser's MediaRecorder, honoring per-frame durations at 12–60 fps and 480p/720p/1080p. On Chrome/Edge it writes WebM; browsers that support MP4 recording get MP4.</li>
          </ul>
          <div className="callout">
            Video export is a recording of a canvas, not an offline encoder: it takes as long as the animation and the tab
            must stay open (the recorder keeps sampling if the tab is in the background). There is no audio track and no
            forced watermark. For frame-accurate compositing in another editor, export the sprite sheet or PNG frames instead.
          </div>
          <p>
            Camera keys and scene settings are part of the project file, so an opening scene reopens exactly as it was saved.
          </p>

          <h2 id="status">11. What is real, what is not</h2>
          <p>
            Everything described above is implemented and usable offline. This build does <strong>not</strong> include the
            Java/Spring Boot community backend: accounts, cloud sync, public galleries, likes, comments, collections,
            challenges and remix publishing are specified in the roadmap but not simulated. The Showcase screen is a local
            presentation page, not a published URL.
          </p>
          <p>
            Further gaps worth naming: panel arrangements are fixed (sizes are resizable, layouts are not saved), keyboard
            shortcuts are not user-remappable yet, tilemaps use a single layer, GIF encoding runs on the main thread and
            large exports briefly block the UI, animated GIFs import their first frame only, video export is WebM/MP4 via
            MediaRecorder (real time, no audio), and there is a single camera track per project rather than multiple shots.
          </p>

          <div className="hstack" style={{ marginTop: 24 }}>
            <button className="btn" onClick={() => setScreen('editor')}>
              Back to the editor
            </button>
            <button className="btn ghost" onClick={() => setScreen('settings')}>
              Settings
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
