package studio.pixelarium.forge;

import studio.pixelarium.forge.SceneData.Bird;
import studio.pixelarium.forge.SceneData.Cloud;
import studio.pixelarium.forge.SceneData.CloudBand;
import studio.pixelarium.forge.SceneData.Color;
import studio.pixelarium.forge.SceneData.Firefly;
import studio.pixelarium.forge.SceneData.Ridge;
import studio.pixelarium.forge.SceneData.Star;

/**
 * Renders hero-scene frames offline.
 *
 * <p>This exists so art changes can be reviewed without a browser: the scene is time-driven, and a
 * headless preview strip at a handful of timestamps shows whether the sun arc, cloud drift and water
 * shimmer read correctly. It follows the browser renderer closely; it is a design tool, not the shipped
 * renderer, and is never bundled into the app.</p>
 */
public final class FrameRenderer {

  private static final byte SKY = 1;
  private static final byte WATER = 2;
  private static final byte LAND = 3;

  /** Constant sun column used for ridge lighting, matching the browser renderer. */
  private static final double LIGHT_X = 40;

  private static final double SHOOTING_STAR_CYCLE = 21000;
  private static final double SHOOTING_STAR_DURATION = 950;

  private final SceneData scene;
  private final int width;
  private final int height;
  private final int horizon;
  private final byte[] base;
  private final byte[] kinds;

  public FrameRenderer(SceneData scene) {
    this.scene = scene;
    this.width = scene.settings().width();
    this.height = scene.settings().height();
    this.horizon = scene.settings().horizon();
    this.base = new byte[width * height * 4];
    this.kinds = new byte[width * height];
    buildBase();
  }

  public int width() {
    return width;
  }

  public int height() {
    return height;
  }

  /** Renders one frame at time {@code t} in milliseconds, returning RGBA bytes. */
  public byte[] render(double t) {
    byte[] out = base.clone();

    stars(out, t);
    moon(out, t);
    sun(out, t);
    shootingStar(out, t);
    clouds(out, t, true);
    birds(out, t);
    reflections(out, t);
    fireflies(out, t);
    clouds(out, t, false);
    return out;
  }

  /** Renders several frames side by side, separated by a dark gutter. */
  public byte[] renderStrip(double[] times, int gap) {
    int count = times.length;
    int outWidth = count * width + (count - 1) * gap;
    byte[] strip = new byte[outWidth * height * 4];
    for (int i = 0; i < outWidth; i++) {
      for (int y = 0; y < height; y++) {
        int index = (y * outWidth + i) * 4;
        strip[index] = 18;
        strip[index + 1] = 18;
        strip[index + 2] = 24;
        strip[index + 3] = (byte) 255;
      }
    }
    for (int f = 0; f < count; f++) {
      byte[] frame = render(times[f]);
      int offsetX = f * (width + gap);
      for (int y = 0; y < height; y++) {
        for (int x = 0; x < width; x++) {
          int from = (y * width + x) * 4;
          int to = (y * outWidth + offsetX + x) * 4;
          strip[to] = frame[from];
          strip[to + 1] = frame[from + 1];
          strip[to + 2] = frame[from + 2];
          strip[to + 3] = frame[from + 3];
        }
      }
    }
    return strip;
  }

  public int stripWidth(int frames, int gap) {
    return frames * width + (frames - 1) * gap;
  }

  /* ------------------------------------------------------------------ */
  /* Static layers                                                       */
  /* ------------------------------------------------------------------ */

  private void buildBase() {
    SceneData.Settings settings = scene.settings();
    for (int y = 0; y < height; y++) {
      boolean sky = y < horizon;
      for (int x = 0; x < width; x++) {
        Color color;
        if (sky) {
          color = scene.palette().skyAt(y, horizon);
        } else {
          double depth = (y - horizon) / (double) Math.max(1, height - horizon - 1);
          color = scene.palette().waterTop().mix(scene.palette().waterBottom(), depth);
          double wave = Math.sin(x * 0.42 + y * 1.9) * 0.5 + 0.5;
          color = color.mix(scene.palette().waterSheen(), wave * 0.2 * (1 - depth));
        }
        int index = (y * width + x) * 4;
        base[index] = (byte) color.r();
        base[index + 1] = (byte) color.g();
        base[index + 2] = (byte) color.b();
        base[index + 3] = (byte) 255;
        kinds[y * width + x] = sky ? SKY : WATER;
      }
    }
    paintRidge(scene.farRidge());
    paintRidge(scene.nearRidge());

    if (settings.seed() == 0) {
      throw new IllegalStateException("scene seed must not be zero");
    }
  }

  private void paintRidge(Ridge ridge) {
    int baseY = (int) Math.round(ridge.baseY());
    int[] tops = RidgeGeometry.profile(ridge, width);
    for (int x = 0; x < width; x++) {
      int top = tops[x];
      int slope = RidgeGeometry.slope(tops, x);
      boolean lit = x < LIGHT_X ? slope < -0.15 : slope > 0.15;
      for (int y = Math.max(0, top); y < baseY && y < height; y++) {
        double depth = (y - top) / (double) Math.max(1, baseY - top);
        Color color = ridge.shade().mix(ridge.body(), Math.min(1, depth * 1.6));
        if (y == top) {
          color = ridge.rim();
        } else if (y == top + 1) {
          color = ridge.rim().mix(color, 0.55);
        } else if (lit) {
          color = color.mix(ridge.rim(), 0.18);
        }
        int index = (y * width + x) * 4;
        base[index] = (byte) color.r();
        base[index + 1] = (byte) color.g();
        base[index + 2] = (byte) color.b();
        base[index + 3] = (byte) 255;
        kinds[y * width + x] = LAND;
      }
    }
  }

  /* ------------------------------------------------------------------ */
  /* Animated layers                                                     */
  /* ------------------------------------------------------------------ */

  private void stars(byte[] out, double t) {
    for (Star star : scene.stars()) {
      if (kinds[star.y() * width + star.x()] != SKY) continue;
      double twinkle = 0.5 + 0.5 * Math.sin(t * 0.0016 + star.phase());
      double heightFactor = 1 - star.y() / 30.0;
      double alpha = (0.25 + 0.6 * twinkle) * (0.45 + heightFactor * 0.55);
      blend(out, star.x(), star.y(), star.warm() ? scene.palette().starWarm() : scene.palette().starCool(), alpha);
    }
  }

  private void sun(byte[] out, double t) {
    double angle = (t / 52000.0) * Math.PI * 2;
    double sunX = 39 + Math.sin(angle) * 5;
    double sunY = 25 + Math.cos(angle) * 2;
    halo(out, sunX, sunY, 14, scene.palette().sunHalo(), 0.22);
    halo(out, sunX, sunY, 8, scene.palette().sunOuter(), 0.3);
    disc(out, sunX, sunY, 6, scene.palette().sunHalo(), 0.92);
    disc(out, sunX, sunY, 4.2, scene.palette().sunOuter(), 0.95);
    disc(out, sunX, sunY, 2.6, scene.palette().sunMid(), 1);
    disc(out, sunX - 1, sunY - 1, 1.2, scene.palette().sunCore(), 1);
  }

  private void moon(byte[] out, double t) {
    double angle = (t / 74000.0) * Math.PI * 2 + Math.PI;
    double moonX = 15 + Math.sin(angle) * 4;
    double moonY = 9 + Math.cos(angle) * 1.6;
    int mx = (int) Math.round(moonX);
    int my = (int) Math.round(moonY);
    halo(out, moonX, moonY, 6, scene.palette().moonHalo(), 0.12);
    blend(out, mx - 1, my, scene.palette().moon(), 0.55);
    blend(out, mx, my - 1, scene.palette().moon(), 0.6);
    blend(out, mx, my, scene.palette().moonHighlight(), 0.85);
    blend(out, mx, my + 1, scene.palette().moon(), 0.5);
  }

  private void shootingStar(byte[] out, double t) {
    double progress = t % SHOOTING_STAR_CYCLE;
    if (progress > SHOOTING_STAR_DURATION) return;
    double k = progress / SHOOTING_STAR_DURATION;
    double headX = 4 + k * 44;
    double headY = 5 + k * 13;
    for (int i = 0; i < 10; i++) {
      double tail = 1 - i / 10.0;
      int x = (int) Math.round(headX - i * 1.05);
      int y = (int) Math.round(headY - i * 0.31);
      if (x < 0 || y < 0 || x >= width || y >= height) continue;
      if (kinds[y * width + x] != SKY) continue;
      double fade = tail * (1 - k * 0.7) * (i == 0 ? 0.95 : 0.6);
      blend(out, x, y, i == 0 ? scene.palette().moonHighlight() : scene.palette().starWarm(), fade);
    }
  }

  private void clouds(byte[] out, double t, boolean behind) {
    for (CloudBand band : scene.cloudBands()) {
      if (band.behindRidges() != behind) continue;
      for (Cloud cloud : band.clouds()) {
        double span = width + cloud.rx() * 2;
        double raw = (cloud.x() + (t / 1000.0) * cloud.speed()) % span;
        double cx = ((raw % span) + span) % span - cloud.rx();
        int yFrom = (int) Math.floor(cloud.y() - cloud.ry());
        int yTo = (int) Math.ceil(cloud.y() + cloud.ry());
        int xFrom = (int) Math.floor(cx - cloud.rx());
        int xTo = (int) Math.ceil(cx + cloud.rx());
        for (int y = yFrom; y <= yTo; y++) {
          if (y < 0 || y >= height) continue;
          for (int x = xFrom; x <= xTo; x++) {
            int sx = ((x % width) + width) % width;
            if (band.behindRidges() && kinds[y * width + sx] != SKY) continue;
            double nx = (x - cx) / cloud.rx();
            double ny = (y - cloud.y()) / cloud.ry();
            double d = nx * nx + ny * ny;
            if (d > 1) continue;
            double alpha = band.alpha() * (1 - d * 0.55);
            blend(out, sx, y, ny < -0.25 ? band.topColor() : band.color(), alpha);
          }
        }
      }
    }
  }

  private void birds(byte[] out, double t) {
    for (Bird bird : scene.birds()) {
      double span = width + 24;
      double raw = (bird.start() + (t / 1000.0) * bird.speed()) % span;
      double x = ((raw % span) + span) % span - 12;
      double y = bird.y() + Math.sin(t * 0.0008 + bird.phase()) * 1.4;
      boolean up = Math.sin(t * 0.018 + bird.phase()) > 0;
      int px = (int) Math.round(x);
      int py = (int) Math.round(y);
      int[][] wings =
          up
              ? new int[][] {{px - 1, py + 1}, {px, py}, {px + 1, py + 1}}
              : new int[][] {{px - 1, py}, {px, py + 1}, {px + 1, py}};
      for (int[] wing : wings) {
        int wx = wing[0];
        int wy = wing[1];
        if (wx < 0 || wy < 0 || wx >= width || wy >= height) continue;
        if (kinds[wy * width + wx] != SKY) continue;
        blend(out, wx, wy, scene.palette().bird(), 0.8);
      }
    }
  }

  private void reflections(byte[] out, double t) {
    double angle = (t / 52000.0) * Math.PI * 2;
    double sunX = 39 + Math.sin(angle) * 5;
    for (int y = horizon; y < height; y++) {
      double depth = (y - horizon) / (double) Math.max(1, height - horizon);
      double wobble = Math.sin(t * 0.0022 + y * 0.85) * (0.6 + depth * 1.8);
      double center = sunX + wobble;
      double half = 1.4 + depth * 4.8;
      for (int x = (int) Math.floor(center - half); x <= (int) Math.ceil(center + half); x++) {
        int sx = ((x % width) + width) % width;
        if (kinds[y * width + sx] != WATER) continue;
        double edge = 1 - Math.abs(x - center) / half;
        if (edge <= 0) continue;
        double flicker = 0.55 + 0.45 * Math.sin(t * 0.005 + y * 1.7 + x * 0.6);
        double alpha = Math.pow(edge, 1.4) * flicker * (1.05 - depth * 0.4);
        if (alpha <= 0.02) continue;
        blend(
            out,
            sx,
            y,
            depth < 0.35 ? scene.palette().reflectionNear() : scene.palette().reflectionFar(),
            alpha);
      }
    }
  }

  private void fireflies(byte[] out, double t) {
    for (Firefly fly : scene.fireflies()) {
      double x = fly.x() + Math.sin(t * 0.0006 * fly.speed() + fly.phase()) * 2.6;
      double y = fly.y() + Math.cos(t * 0.00072 * fly.speed() + fly.phase() * 1.3) * 1.7;
      double pulse = Math.max(0, Math.sin(t * 0.0013 * fly.speed() + fly.phase()));
      double alpha = 0.18 + pulse * pulse * 0.75;
      int px = (int) Math.round(x);
      int py = (int) Math.round(y);
      blend(out, px, py, scene.palette().firefly(), alpha);
      blend(out, px + 1, py, scene.palette().firefly(), alpha * 0.22);
      blend(out, px - 1, py, scene.palette().firefly(), alpha * 0.22);
      blend(out, px, py + 1, scene.palette().firefly(), alpha * 0.22);
      blend(out, px, py - 1, scene.palette().firefly(), alpha * 0.22);
    }
  }

  /* ------------------------------------------------------------------ */
  /* Primitives                                                          */
  /* ------------------------------------------------------------------ */

  private void blend(byte[] out, int x, int y, Color color, double alpha) {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    if (alpha <= 0) return;
    double a = Math.min(1, alpha);
    int index = (y * width + x) * 4;
    out[index] = (byte) Math.round((out[index] & 0xFF) + (color.r() - (out[index] & 0xFF)) * a);
    out[index + 1] = (byte) Math.round((out[index + 1] & 0xFF) + (color.g() - (out[index + 1] & 0xFF)) * a);
    out[index + 2] = (byte) Math.round((out[index + 2] & 0xFF) + (color.b() - (out[index + 2] & 0xFF)) * a);
  }

  private void disc(byte[] out, double cx, double cy, double r, Color color, double alpha) {
    for (int y = (int) Math.floor(cy - r); y <= (int) Math.ceil(cy + r); y++) {
      for (int x = (int) Math.floor(cx - r); x <= (int) Math.ceil(cx + r); x++) {
        if (x < 0 || y < 0 || x >= width || y >= height) continue;
        double dx = x - cx;
        double dy = y - cy;
        if (dx * dx + dy * dy > r * r) continue;
        if (kinds[y * width + x] != SKY) continue;
        blend(out, x, y, color, alpha);
      }
    }
  }

  private void halo(byte[] out, double cx, double cy, double r, Color color, double strength) {
    for (int y = (int) Math.floor(cy - r); y <= (int) Math.ceil(cy + r); y++) {
      for (int x = (int) Math.floor(cx - r); x <= (int) Math.ceil(cx + r); x++) {
        if (x < 0 || y < 0 || x >= width || y >= height) continue;
        if (kinds[y * width + x] != SKY) continue;
        double d = Math.hypot(x - cx, y - cy) / r;
        if (d >= 1) continue;
        blend(out, x, y, color, Math.pow(1 - d, 2) * strength);
      }
    }
  }
}
