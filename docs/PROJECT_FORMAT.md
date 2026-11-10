# Pixelarium project format (`.pxl`)

A `.pxl` file is a UTF-8 JSON document. The current format version is **1**.

```json
{
  "format": "pixelarium",
  "version": 1,
  "app": "Pixelarium",
  "savedAt": "2026-11-10T12:00:00.000Z",
  "document": { "...": "..." }
}
```

`format` must be `"pixelarium"`. A reader should reject files with a higher
`version` than it understands. `savedAt` is informational only.

## Document

| Field | Type | Notes |
| --- | --- | --- |
| `id` | string | Document identifier. |
| `name` | string | Project name. |
| `width`, `height` | number | Canvas size in pixels, 1–4096. |
| `layers` | Layer[] | Bottom-most layer first. |
| `frames` | Frame[] | At least one frame. |
| `palettes` | Palette[] | Includes the built-in palettes used by the editor. |
| `activePaletteId` | string | Palette selected in the colour panel. |
| `primary`, `secondary` | string | `#rrggbb` colours. |
| `tags` | AnimationTag[] | Timeline tags. |
| `meta` | object | `createdAt`, `updatedAt`, `description`, `author`, `tags`. |

### Layer

```json
{
  "id": "layer-1",
  "name": "Body",
  "visible": true,
  "locked": false,
  "opacity": 255,
  "blend": "normal"
}
```

`opacity` is 0–255. `blend` is one of `normal`, `multiply`, `screen`,
`overlay`, `add`, `subtract`, `darken`, `lighten`, `difference`.

### Frame

```json
{
  "id": "frame-1",
  "duration": 100,
  "label": "Contact",
  "cels": { "layer-1": "AAAAAA==" },
  "camera": { "x": 0.5, "y": 0.5, "zoom": 1 }
}
```

`duration` is milliseconds, minimum 10. `label` and `camera` are optional.
`cels` maps a layer id to one base64 string.

A cel is raw RGBA bytes in row-major order: `width * height * 4` bytes, one
byte per channel. The example `AAAAAA==` is four zero bytes, i.e. a single
transparent pixel. Layers without a cel in a frame are treated as empty.

### Animation tag

```json
{ "id": "tag-1", "name": "walk", "from": 0, "to": 3, "mode": "forward", "fps": 10 }
```

`from` and `to` are inclusive frame indices. `mode` is `forward`, `reverse`
or `pingpong`. `fps` is optional.

## Optional document sections

### `indexed`

Boolean. When true, new colours snap to the active palette and stamps stay
opaque.

### `nineSlice`

```json
{ "left": 8, "right": 8, "top": 8, "bottom": 8 }
```

Insets in pixels. Opposite edges are clamped so they cannot overlap.

### `cinema`

```json
{
  "aspect": "16:9",
  "fit": "contain",
  "background": "#0b0b10",
  "fps": 24
}
```

`aspect` is `16:9`, `9:16`, `1:1`, `4:3` or `source`. `fit` is `contain` or
`cover`.

### `gui`

A Minecraft menu layout.

```json
{
  "name": "shop",
  "title": "&8&lSHOP MENU",
  "openCommand": "shop",
  "rows": 3,
  "texture": "chest",
  "namespace": "pixelarium",
  "permission": "",
  "slots": [
    {
      "index": 13,
      "material": "DIAMOND",
      "name": "Diamonds",
      "lore": ["Click to buy"],
      "amount": 1,
      "action": "give %player% diamond 1",
      "icon": { "x": 0, "y": 0, "w": 16, "h": 16 }
    }
  ]
}
```

`rows` is 1–6. `texture` is `chest`, `hopper`, `generic` or `custom`.
`index` is row-major, starting at 0. `icon` is a rectangle on the project
canvas, or `null`.

### `guiTexture`

```json
{
  "theme": "obsidian",
  "header": true,
  "wells": true,
  "grain": true,
  "ornaments": true,
  "accent": "",
  "padding": 6
}
```

`accent` empty means the theme's default accent. `padding` is the frame
thickness in pixels (maximum 14).

### `scene`

```json
{
  "width": 320,
  "height": 180,
  "backdrop": { "kind": "vertical", "from": "#141026", "to": "#452f5c", "dither": true },
  "props": [
    {
      "id": "prop_0",
      "name": "Hero",
      "frame": 0,
      "x": 128,
      "y": 58,
      "scale": 2,
      "flipX": false,
      "opacity": 100
    }
  ],
  "fx": {
    "vignette": 32,
    "light": { "x": 208, "y": 66, "radius": 92, "color": "#ffe6a8", "strength": 42 }
  }
}
```

`backdrop.kind` is `vertical`, `radial` or `flat`. `props[].scale` is a whole
number from 1 to 8, and `opacity` is 0–100. `fx.light` may be `null`. Scene
size is limited to 1024 px and a scene holds at most 64 props.

### `tilemap`

```json
{
  "tileSize": 16,
  "cols": 14,
  "rows": 9,
  "tiles": [{ "id": "tile-1", "name": "Grass", "pixels": "AAAAAA==" }],
  "cells": ["tile-1", null]
}
```

Tile pixels use the same base64 RGBA encoding as cels, at `tileSize` square.
`cells` is row-major with `cols * rows` entries; `null` means an empty cell.

## Reading behaviour

The loader is intentionally forgiving:

- Missing cels become transparent buffers of the correct size.
- Unknown blend modes fall back to `normal`.
- Corrupt base64 cels become empty cels.
- Tile and prop ids that no longer exist are dropped.
- Out-of-range numbers are clamped to the documented limits.

Malformed JSON, a missing `document`, a wrong `format`, a newer `version` or
an empty layer/frame list are errors and the file is not opened.
