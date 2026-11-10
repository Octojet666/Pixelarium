package studio.pixelarium.forge;

import java.io.ByteArrayOutputStream;
import java.util.List;
import studio.pixelarium.forge.OpeningData.Ember;
import studio.pixelarium.forge.OpeningData.Layer;
import studio.pixelarium.forge.OpeningData.Letter;
import studio.pixelarium.forge.OpeningData.Mist;
import studio.pixelarium.forge.OpeningData.Palette;
import studio.pixelarium.forge.SceneData.Color;
import studio.pixelarium.forge.SceneData.Star;

/**
 * Renders the opening scene offline, mirroring the browser's draw order so a preview PNG is honest.
 *
 * <p>Only the wordmark reveal, the fade and the input prompt are browser-only: they are UI timing, not
 * art direction. Everything a viewer would call "the picture" — sky, stars, moon, three parallax
 * ranges, the lit gate, the path, embers, haze and the title lettering — is painted here with the same
 * numbers the TypeScript renderer reads from the generated JSON.</p>
 */
public final class OpeningRenderer {

  /** Parallax period, matching {@code OPENING_DRIFT_PERIOD} in the browser. */
  private static final double DRIFT_PERIOD_MS = 36000;

  /** Where the moon sits. A title screen reads better with the moon off-centre. */
  private static final double MOON_X = 128;
  private static final double MOON_Y = 21;
  private static final double MOON_RADIUS = 4;

  private final OpeningData scene;
  private final int width;
  private final int height;
  private final int[] base;

  public OpeningRenderer(OpeningData scene) {
    this.scene = scene;
    this.width = scene.settings().width();
    this.height = scene.settings().height();
    this.base = buildBase();
  }

  public int width() {
    return width;
  }

  public int height() {
    return height;
  }

  /** One finished frame at time {@code t} (milliseconds) as opaque 0xRRGGBB pixels. */
  public int[] frame(double t) {
    int[] px = base.clone();
    stars(px, t);
    moon(px);
    for (Layer layer : scene.layers()) ridges(px, layer, t);
    gate(px, t);
    path(px);
    embers(px, t);
    mist(px, t);
    vignette(px);
    // The title is painted after the vignette so the edges of the frame never dim the lettering.
    wordmark(px);
    return px;
  }

  /* ------------------------------------------------------------------ */
  /* Background                                                          */
  /* ------------------------------------------------------------------ */

  private int[] buildBase() {
    int[] px = new int[width * height];
    Palette palette = scene.palette();
    int horizon = scene.settings().horizon();
    for (int y = 0; y < height; y++) {
      for (int x = 0; x < width; x++) {
        Color color;
        if (y < horizon) {
          color = palette.skyAt(y, horizon);
        } else {
          double depth = (y - horizon) / (double) Math.max(1, height - horizon - 1);
          color = palette.ground().mix(palette.groundShade(), depth);
        }
        px[y * width + x] = rgb(color);
      }
    }
    return px;
  }

  private void stars(int[] px, double t) {
    int horizon = scene.settings().horizon();
    for (Star star : scene.stars()) {
      int x = star.x();
      int y = star.y();
      if (x < 0 || y < 0 || x >= width || y >= horizon) continue;
      double twinkle = 0.5 + 0.5 * Math.sin(t * 0.0016 + star.phase());
      double heightFalloff = 1 - y / (double) horizon;
      double alpha = (0.22 + 0.62 * twinkle) * (0.45 + heightFalloff * 0.55);
      blend(px, x, y, star.warm() ? scene.palette().starWarm() : scene.palette().starCool(), alpha);
    }
  }

  private void moon(int[] px) {
    Palette palette = scene.palette();
    halo(px, MOON_X, MOON_Y, MOON_RADIUS + 7, palette.moonHalo(), 0.10);
    halo(px, MOON_X, MOON_Y, MOON_RADIUS + 3, palette.moonHalo(), 0.16);
    disc(px, MOON_X, MOON_Y, MOON_RADIUS, palette.moon(), 0.96);
    // Bite out of the upper right to leave a crescent, using the sky colour behind it.
    double biteX = MOON_X + 2.1;
    double biteY = MOON_Y - 1.6;
    disc(px, biteX, biteY, MOON_RADIUS * 0.92, null, 1);
    blend(px, (int) Math.round(MOON_X - 2), (int) Math.round(MOON_Y + 1), palette.moonHighlight(), 0.9);
    blend(px, (int) Math.round(MOON_X - 1), (int) Math.round(MOON_Y + 2), palette.moonHighlight(), 0.75);
  }

  private void ridges(int[] px, Layer layer, double t) {
    int baseY = (int) Math.round(layer.baseY());
    double offset = drift(t, layer.parallax());
    for (int x = 0; x < width; x++) {
      int sample = x - (int) Math.round(offset);
      int top = RidgeGeometry.top(sample, layer.peaks(), baseY);
      int bottom = Math.min(baseY, height);
      int span = Math.max(1, baseY - top);
      for (int y = Math.max(0, top); y < bottom; y++) {
        double depth = (y - top) / (double) span;
        Color color = layer.shade().mix(layer.body(), Math.min(1, depth * 1.6));
        if (y <= top + 1) color = layer.rim().mix(color, y == top ? 0 : 0.55);
        // A faint warm spill where the gate light reaches the inner cliff faces.
        double toGate = Math.abs(x - scene.gate().cx());
        double spill = Math.max(0, 1 - toGate / 34.0) * Math.max(0, 1 - depth * 1.2);
        if (spill > 0) color = color.mix(scene.gate().glowMid(), spill * 0.16);
        px[y * width + x] = rgb(color);
      }
    }
  }

  /* ------------------------------------------------------------------ */
  /* Gate, path, particles                                               */
  /* ------------------------------------------------------------------ */

  private void gate(int[] px, double t) {
    OpeningData.Gate gate = scene.gate();
    int cx = gate.cx();
    int baseY = (int) Math.round(gate.baseY());
    int radius = gate.radius();
    int thickness = gate.thickness();
    int archY = baseY - gate.rise();
    int crownY = archY - radius;
    int innerRadius = radius - thickness;
    double pulse = 0.86 + 0.14 * Math.sin(t * 0.0014);

    // Light spilling out of the doorway and past the stone.
    haloAround(px, cx, baseY - 6, radius + 13, gate.glowEdge(), 0.11 * pulse);

    // Interior: firelight, hot at the floor and violet up at the crown.
    int floorY = baseY - 2;
    for (int y = crownY; y <= baseY; y++) {
      for (int x = cx - radius; x <= cx + radius; x++) {
        double dx = x - cx;
        boolean inside = Math.abs(dx) < innerRadius
            && (y > archY || Math.hypot(dx, y - archY) < innerRadius);
        if (!inside) continue;
        double heat = Math.max(0, Math.min(1, (floorY - y) / (double) Math.max(1, floorY - crownY)));
        Color color = heat < 0.45
            ? gate.glowCore().mix(gate.glowMid(), heat / 0.45)
            : gate.glowMid().mix(gate.glowEdge(), (heat - 0.45) / 0.55);
        double shimmer = 0.92 + 0.08 * Math.sin(t * 0.003 + y * 0.7 + x * 0.3);
        blend(px, x, y, color, (0.97 - heat * 0.45) * pulse * shimmer);
      }
    }

    // Stone: two pillars carrying a half ring, rim-lit inside and shaded outside.
    for (int y = crownY - 1; y < baseY; y++) {
      for (int x = cx - radius; x <= cx + radius; x++) {
        double dx = x - cx;
        double distance = y <= archY ? Math.hypot(dx, y - archY) : Math.abs(dx);
        if (distance > radius || distance < innerRadius) continue;
        Color color = gate.stone();
        if (distance <= innerRadius + 1) color = gate.stoneRim();
        else if (distance >= radius - 0.5) color = gate.stoneShade();
        px[y * width + x] = rgb(color);
      }
    }

    // Two footing blocks, so the gate looks built rather than pasted on.
    for (int x = cx - radius - 2; x <= cx + radius + 2; x++) {
      for (int y = baseY; y < Math.min(height, baseY + 2); y++) {
        px[y * width + x] = rgb(y == baseY ? gate.stoneRim().mix(gate.stone(), 0.5) : gate.stoneShade());
      }
    }
  }

  private void path(int[] px) {
    OpeningData.Path path = scene.path();
    int top = path.topY();
    int bottom = Math.min(path.bottomY(), height);
    int span = Math.max(1, bottom - top);
    for (int y = top; y < bottom; y++) {
      double t = (y - top) / (double) span;
      double half = path.topHalf() + (path.bottomHalf() - path.topHalf()) * t;
      int cx = (int) Math.round(path.cx());
      int from = (int) Math.floor(cx - half);
      int to = (int) Math.ceil(cx + half);
      for (int x = from; x <= to; x++) {
        if (x < 0 || x >= width) continue;
        double edge = Math.abs(x - cx) / half;
        Color color = edge > 0.86 ? path.edge() : path.color();
        if ((x + y) % 7 == 0) color = color.mix(path.edge(), 0.35);
        blend(px, x, y, color, 0.75 + t * 0.2);
      }
    }
  }

  private void embers(int[] px, double t) {
    Palette palette = scene.palette();
    for (Ember ember : scene.embers()) {
      double cycle = ((t / 1000) * ember.speed() + ember.phase()) % 1;
      if (cycle < 0) cycle += 1;
      double y = ember.y() - cycle * ember.rise();
      double x = ember.x() + Math.sin(t * 0.0016 + ember.phase() * 6.283) * 1.8;
      double alpha = Math.pow(1 - cycle, 1.5) * 0.95;
      if (alpha <= 0.02) continue;
      int px0 = (int) Math.round(x);
      int py0 = (int) Math.round(y);
      Color color = cycle < 0.3 ? palette.emberHot() : palette.ember();
      blend(px, px0, py0, color, alpha);
      blend(px, px0, py0 - 1, color, alpha * 0.28);
      blend(px, px0 + 1, py0, color, alpha * 0.22);
      blend(px, px0 - 1, py0, color, alpha * 0.22);
    }
  }

  private void mist(int[] px, double t) {
    List<Mist> bands = scene.mist();
    for (Mist band : bands) {
      int y0 = (int) Math.round(band.y());
      int rows = (int) Math.round(band.thickness());
      for (int i = 0; i < rows; i++) {
        int y = y0 + i;
        if (y < 0 || y >= height) continue;
        double shape = Math.sin(Math.PI * (i + 1) / (rows + 1));
        for (int x = 0; x < width; x++) {
          double wave = 0.55 + 0.45 * Math.sin(x * 0.075 + t * 0.0009 * band.speed() + y * 0.35);
          blend(px, x, y, band.color(), band.alpha() * shape * wave);
        }
      }
    }
  }

  private void wordmark(int[] px) {
    OpeningData.Wordmark wordmark = scene.wordmark();
    Palette palette = scene.palette();
    for (Letter letter : wordmark.letters()) {
      for (int[] run : letter.runs()) {
        for (int y = letter.y() + run[1]; y < letter.y() + run[1] + run[3]; y++) {
          for (int x = letter.x() + run[0]; x < letter.x() + run[0] + run[2]; x++) {
            if (x < 1 || y < 1 || x >= width - 1 || y >= height - 1) continue;
            // Glow first, then the shadow, then the letterform itself.
            blend(px, x, y + 1, palette.glyphShadow(), 0.55);
            blend(px, x + 1, y + 1, palette.glyphShadow(), 0.35);
            blend(px, x, y, palette.glyphGlow(), 0.16);
            px[y * width + x] = rgb(palette.glyph());
          }
        }
      }
    }
  }

  private void vignette(int[] px) {
    for (int y = 0; y < height; y++) {
      for (int x = 0; x < width; x++) {
        double nx = Math.abs(x - width / 2.0) / (width / 2.0);
        double ny = Math.abs(y - height / 2.0) / (height / 2.0);
        double edge = Math.max(0, Math.max(nx, ny) - 0.62) / 0.38;
        if (edge <= 0) continue;
        blend(px, x, y, new Color(3, 3, 8), edge * edge * 0.42);
      }
    }
  }

  /* ------------------------------------------------------------------ */
  /* Brush                                                               */
  /* ------------------------------------------------------------------ */

  /** Horizontal camera offset for a layer at time {@code t}, in whole pixels. */
  private double drift(double t, double parallax) {
    return Math.sin((t / DRIFT_PERIOD_MS) * Math.PI * 2) * scene.settings().drift() * parallax;
  }

  /** Bakes a pixel only where the sky is: celestial bodies never draw over the ranges. */
  private void disc(int[] px, double cx, double cy, double radius, Color color, double alpha) {
    int horizon = scene.settings().horizon();
    for (int y = (int) Math.floor(cy - radius); y <= (int) Math.ceil(cy + radius); y++) {
      for (int x = (int) Math.floor(cx - radius); x <= (int) Math.ceil(cx + radius); x++) {
        if (x < 0 || y < 0 || x >= width || y >= height) continue;
        if ((x - cx) * (x - cx) + (y - cy) * (y - cy) > radius * radius) continue;
        if (y >= horizon) continue;
        // A null colour means "cut a hole": restore the sky behind the moon.
        Color paint = color == null ? scene.palette().skyAt(y, horizon) : color;
        blend(px, x, y, paint, alpha);
      }
    }
  }

  private void halo(int[] px, double cx, double cy, double radius, Color color, double strength) {
    int horizon = scene.settings().horizon();
    for (int y = (int) Math.floor(cy - radius); y <= (int) Math.ceil(cy + radius); y++) {
      for (int x = (int) Math.floor(cx - radius); x <= (int) Math.ceil(cx + radius); x++) {
        if (x < 0 || y < 0 || x >= width || y >= height || y >= horizon) continue;
        double d = Math.hypot(x - cx, y - cy) / radius;
        if (d >= 1) continue;
        blend(px, x, y, color, Math.pow(1 - d, 2) * strength);
      }
    }
  }

  /** Glow that may spill over the ranges, used for the gate light. */
  private void haloAround(int[] px, double cx, double cy, double radius, Color color, double strength) {
    for (int y = (int) Math.floor(cy - radius); y <= (int) Math.ceil(cy + radius); y++) {
      for (int x = (int) Math.floor(cx - radius); x <= (int) Math.ceil(cx + radius); x++) {
        if (x < 0 || y < 0 || x >= width || y >= height) continue;
        double d = Math.hypot(x - cx, y - cy) / radius;
        if (d >= 1) continue;
        blend(px, x, y, color, Math.pow(1 - d, 3) * strength);
      }
    }
  }

  private void blend(int[] px, int x, int y, Color color, double alpha) {
    if (x < 0 || y < 0 || x >= width || y >= height || alpha <= 0) return;
    double a = Math.min(1, alpha);
    int index = y * width + x;
    int current = px[index];
    int r = (int) Math.round(((current >> 16) & 0xff) + (color.r() - ((current >> 16) & 0xff)) * a);
    int g = (int) Math.round(((current >> 8) & 0xff) + (color.g() - ((current >> 8) & 0xff)) * a);
    int b = (int) Math.round((current & 0xff) + (color.b() - (current & 0xff)) * a);
    px[index] = (clamp(r) << 16) | (clamp(g) << 8) | clamp(b);
  }

  private static int clamp(int value) {
    return Math.max(0, Math.min(255, value));
  }

  private static int rgb(Color color) {
    return (color.r() << 16) | (color.g() << 8) | color.b();
  }

  /* ------------------------------------------------------------------ */
  /* Preview strip                                                       */
  /* ------------------------------------------------------------------ */

  /** Frames side by side, separated by {@code gap} transparent columns. */
  public byte[] renderStrip(double[] frames, int gap) {
    int stripWidth = stripWidth(frames.length, gap);
    ByteArrayOutputStream out = new ByteArrayOutputStream(stripWidth * height * 4);
    int[][] rendered = new int[frames.length][];
    for (int i = 0; i < frames.length; i++) rendered[i] = frame(frames[i]);
    for (int y = 0; y < height; y++) {
      for (int i = 0; i < frames.length; i++) {
        if (i > 0) {
          for (int g = 0; g < gap; g++) {
            out.write(0);
            out.write(0);
            out.write(0);
            out.write(0);
          }
        }
        for (int x = 0; x < width; x++) {
          int value = rendered[i][y * width + x];
          out.write((value >> 16) & 0xff);
          out.write((value >> 8) & 0xff);
          out.write(value & 0xff);
          out.write(255);
        }
      }
    }
    return out.toByteArray();
  }

  public int stripWidth(int count, int gap) {
    return count * width + Math.max(0, count - 1) * gap;
  }
}
