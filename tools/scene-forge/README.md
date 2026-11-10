# Scene Forge (Java)

Build-time tool that owns the art direction data for both painted scenes:

- `src/data/heroScene.json` — the landing-page hero ("Dusk Peaks"): palette, ridge silhouettes, seeded
  star field, parallax cloud bands, fireflies and the bird flock, consumed by
  `src/components/HeroScene.tsx`.
- `tools/scene-forge/out/hero-strip.png` — a strip of rendered frames, so the animation can be reviewed
  without opening a browser (handy in CI or when a preview tab is throttled).
- `src/data/openingScene.json` — the game-style opening ("Ember Gate"): night palette, three parallax
  ranges, the lit gate, the path, seeded stars and embers, haze bands, and the **PIXELARIUM** wordmark
  rasterised from a 5×7 font into pixel runs. Consumed by `src/components/OpeningScene.tsx`.
- `tools/scene-forge/out/opening-strip.png` — frames of the opening for offline review.

## Why Java?

The app itself must stay a static, offline-first PWA: browsers run JavaScript, so a JVM cannot ship
with it. The scene data is the one place where a second language earns its keep — it is deterministic,
pure computation over fixings (palette, seeds, geometry), it benefits from types and unit-testable
purity, and it has to run *somewhere* before the app is built. Keeping it out of the runtime means the
browser bundle stays small and the deployment stays static.

**The generated JSON is committed.** Nothing in `npm run dev`, `npm run build` or `npm test` needs a
JDK; Java is only required when the scene data itself changes.

## Requirements

JDK 17 or newer (`javac` and `java` on `PATH`). No Maven, Gradle or downloads: `build.sh` calls `javac`
directly and the tool has no third-party dependencies.

## Usage

```bash
bash tools/scene-forge/build.sh          # compile only
bash tools/scene-forge/run.sh --all      # JSON + preview strip + validation (the usual command)
bash tools/scene-forge/run.sh --validate # checks only, non-zero exit on bad data
bash tools/scene-forge/run.sh --self-test # the tool's own 17 tests, non-zero exit on failure
bash tools/scene-forge/run.sh --check    # fail if src/data/heroScene.json is stale
bash tools/scene-forge/run.sh --out src/data/heroScene.json
bash tools/scene-forge/run.sh --frames 0,3000,9000 --png tools/scene-forge/out/hero-strip.png
bash tools/scene-forge/run.sh --seed 1234 --out /tmp/preview.json

bash tools/scene-forge/run.sh --opening         # regenerates the opening JSON + preview strip
bash tools/scene-forge/run.sh --opening-check   # fails if src/data/openingScene.json is stale
bash tools/scene-forge/run.sh --opening-png tools/scene-forge/out/opening-strip.png
bash tools/scene-forge/run.sh --opening --seed 1234 --opening-out /tmp/opening.json
```

`--all` is what you run after editing the layout: it regenerates the data, re-renders the preview strip
and fails loudly if the data is inconsistent.

## What is checked

`SceneValidator` rejects data that would fail silently in the browser:

- stars placed below the horizon (they would never draw) or outside the canvas
- cloud bands with a zero drift speed, alpha outside 0..1, or a count that disagrees with the cloud list
- fireflies or birds outside the canvas, birds flying below the horizon
- ridges with no peaks, non-positive heights/spreads, or peaks fully off-canvas
- palette ramps that are not strictly increasing, or an fps outside 10..60

## Layout

| File | Role |
| --- | --- |
| `Main.java` | CLI parsing, orchestration, exit codes |
| `SceneLayout.java` | The hero art direction: seeds, palette, ridges, band speeds |
| `SceneData.java` | Immutable hero data model (records) |
| `JsonWriter.java` | Dependency-free JSON output, stable key order |
| `SceneValidator.java` | Bounds and coherence checks |
| `JsonReader.java` | Parser, so generated JSON can be read back and verified |
| `RidgeGeometry.java` | Ridge curve shared by both renderers and the validators |
| `OpeningLayout.java` | The opening art direction: symmetric cliffs, gate, path, embers, wordmark placement |
| `OpeningData.java` | Immutable opening data model (records) |
| `OpeningJson.java` | JSON output for the opening scene, same stable style |
| `OpeningValidator.java` | Rejects titles off-canvas, gates without pillars, embers outside the frame |
| `OpeningRenderer.java` | Offline opening renderer mirroring the browser draw order |
| `Glyphs.java` | The 5×7 wordmark font and its pixel-run rasteriser |
| `SelfTest.java` | 24 self-tests, no framework needed |
| `FrameRenderer.java` | Offline renderer mirroring the browser hero draw order |
| `PngWriter.java` | Minimal RGBA PNG encoder (`Deflater` + `CRC32`) |
| `Rng.java` | mulberry32, bit-identical to the old TypeScript generator |

`Rng` matching mulberry32 is what made the migration to generated data a pure refactor: the same seeds
produce the same star field and cloud placement as before, so the art did not shift when ownership
moved here. **Changing a seed re-rolls the artwork** — review `out/hero-strip.png` afterwards.

## Editing the artwork

1. Change `SceneLayout` (palette, peaks, band speeds, counts, seeds).
2. `bash tools/scene-forge/run.sh --all`.
3. Look at `tools/scene-forge/out/hero-strip.png` — six frames spread over the long cycle.
4. `npm run dev` and check the hero at a few window widths.

Copy and colour changes are safe to hand-edit in `src/data/heroScene.json` for a quick look, but the
next `--all` overwrites them; keep the change in `SceneLayout` if it should stick. `--check` fails when
the committed file and a fresh generation disagree, which is the guard against a forgotten `--all`.

## Tests

`--self-test` covers the parts that break silently:

| Test | What it protects |
| --- | --- |
| `rng matches mulberry32(1)` | the Java PRNG stays bit-identical to the JavaScript one |
| `same seed produces the same JSON` | determinism, so a rebuild is not a re-roll |
| `a different seed re-rolls the layout` | seeds actually reach the generators |
| `JSON round-trips through the reader` | the serialiser emits what the schema says |
| `reader rejects malformed JSON` | the parser fails loudly on broken input |
| `validator catches ...` (5 cases) | broken data cannot pass the gate, including a ridge that hides the water |
| `frames differ over the animation cycle` | the scene cannot silently freeze |
| `rendered frames are fully opaque ...` | no holes in the baked base |
| `PNG encoder writes a valid header` | preview output stays a readable PNG |
| `golden frame at t=0 / t=24000` | a refactor that changes the hero art is caught |
| `opening data passes validation` | the composed title scene is internally consistent |
| `opening validator rejects a gate with no pillars` | a flat arch cannot ship |
| `opening validator rejects a gate off the canvas` | a gate that would be clipped cannot ship |
| `wordmark glyphs rasterise to complete runs` | every lit font pixel becomes exactly one span; unknown letters throw |
| `opening frames differ over the intro` | the scene cannot silently freeze |
| `opening wordmark paints solid glyph pixels` | the title is drawn last and reaches the canvas untouched |
| `opening golden frame at t=0` | a refactor that changes the opening art is caught |

The golden hashes are deliberate tripwires: when the artwork changes on purpose, update the constants in
`SelfTest` in the same commit.
