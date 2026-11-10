package studio.pixelarium.forge;

import java.util.ArrayList;
import java.util.List;
import studio.pixelarium.forge.OpeningData.Ember;
import studio.pixelarium.forge.OpeningData.Gate;
import studio.pixelarium.forge.OpeningData.Layer;
import studio.pixelarium.forge.OpeningData.Mist;
import studio.pixelarium.forge.OpeningData.Palette;
import studio.pixelarium.forge.OpeningData.Path;
import studio.pixelarium.forge.OpeningData.Settings;
import studio.pixelarium.forge.OpeningData.Wordmark;
import studio.pixelarium.forge.SceneData.Color;
import studio.pixelarium.forge.SceneData.Peak;
import studio.pixelarium.forge.SceneData.SkyStop;
import studio.pixelarium.forge.SceneData.Star;

/**
 * Builds the opening title scene deterministically.
 *
 * <p>The composition is symmetric on purpose: two cliffs frame a single lit gate in the middle, which
 * leaves the upper third of the frame empty for the wordmark. Everything here is art direction, so the
 * numbers are hand-chosen and only the particle fields come from a seed.</p>
 */
public final class OpeningLayout {

  public static final int WIDTH = 160;
  public static final int HEIGHT = 96;
  public static final int HORIZON = 68;
  public static final int FPS = 20;
  public static final int DEFAULT_SEED = 20261109;
  /** Horizontal camera drift in canvas pixels; small numbers keep the cliffs on screen. */
  public static final double DRIFT = 3.5;

  public static final int GATE_CX = 80;
  public static final int GATE_BASE_Y = 84;
  public static final int GATE_RADIUS = 11;
  public static final int GATE_THICKNESS = 3;
  /** Height of the straight pillars below the arch: the doorway is taller than it is wide. */
  public static final int GATE_RISE = 15;

  public static final String TITLE = "PIXELARIUM";
  private static final int TITLE_GAP = 2;
  private static final int TITLE_Y = 14;

  private static final int STAR_SEED = 7717;
  private static final int STAR_COUNT = 68;
  private static final int EMBER_SEED = 5150;
  private static final int EMBER_COUNT = 26;

  private OpeningLayout() {}

  public static OpeningData build(int seed) {
    Wordmark wordmark = Glyphs.layout(TITLE, (WIDTH - Glyphs.width(TITLE, TITLE_GAP)) / 2, TITLE_Y, TITLE_GAP);
    return new OpeningData(
        new Settings(WIDTH, HEIGHT, HORIZON, seed, FPS, DRIFT),
        palette(),
        layers(),
        stars(),
        gate(),
        new Path(GATE_CX, GATE_BASE_Y, 7, HEIGHT, 34, new Color(30, 26, 45), new Color(48, 41, 70)),
        embers(),
        mist(),
        wordmark);
  }

  /** A cold night sky with a warm, ember-lit floor. */
  public static Palette palette() {
    return new Palette(
        List.of(
            new SkyStop(0.00, new Color(4, 5, 12)),
            new SkyStop(0.32, new Color(11, 13, 30)),
            new SkyStop(0.62, new Color(24, 22, 50)),
            new SkyStop(0.86, new Color(44, 33, 68)),
            new SkyStop(1.00, new Color(66, 42, 76))),
        new Color(224, 232, 252), // moon
        new Color(250, 252, 255), // moonHighlight
        new Color(120, 140, 210), // moonHalo
        new Color(176, 190, 228), // starCool
        new Color(255, 232, 190), // starWarm
        new Color(126, 116, 176), // mist
        new Color(255, 190, 112), // ember
        new Color(255, 242, 206), // emberHot
        new Color(9, 8, 17),      // ground
        new Color(5, 5, 11),      // groundShade
        new Color(246, 244, 255), // glyph
        new Color(120, 108, 178), // glyphShadow
        new Color(255, 214, 140)); // glyphGlow
  }

  /** Three ranges: haze behind the gate, the shelf it stands on, and near-black cliffs in front. */
  public static List<Layer> layers() {
    return List.of(
        new Layer(
            "far",
            72,
            new Color(52, 48, 94),
            new Color(32, 30, 64),
            new Color(112, 100, 156),
            0.25,
            List.of(new Peak(-6, 30, 46), new Peak(166, 32, 48), new Peak(34, 8, 20), new Peak(128, 7, 18))),
        new Layer(
            "mid",
            84,
            new Color(26, 24, 50),
            new Color(14, 13, 32),
            new Color(66, 56, 102),
            0.5,
            List.of(new Peak(-2, 34, 30), new Peak(162, 36, 32))),
        new Layer(
            "near",
            100,
            new Color(9, 9, 18),
            new Color(4, 4, 10),
            new Color(34, 28, 54),
            0.85,
            List.of(new Peak(-10, 60, 30), new Peak(172, 62, 32), new Peak(-16, 34, 22), new Peak(178, 36, 24))));
  }

  /** A lit gate standing on the mid shelf; the glow lives inside the arch. */
  public static Gate gate() {
    return new Gate(
        GATE_CX,
        GATE_BASE_Y,
        GATE_RADIUS,
        GATE_THICKNESS,
        GATE_RISE,
        new Color(78, 72, 116),
        new Color(40, 36, 64),
        new Color(140, 126, 186),
        new Color(255, 246, 218),
        new Color(255, 182, 100),
        new Color(206, 92, 110));
  }

  private static List<Star> stars() {
    Rng rng = new Rng(STAR_SEED);
    List<Star> stars = new ArrayList<>(STAR_COUNT);
    for (int i = 0; i < STAR_COUNT; i++) {
      int x = rng.intBelow(WIDTH);
      int y = rng.intBelow(50);
      double phase = rng.next() * Math.PI * 2;
      boolean warm = rng.next() < 0.22;
      stars.add(new Star(x, y, phase, warm));
    }
    return List.copyOf(stars);
  }

  /** Embers start inside the gate and drift up through its light. */
  private static List<Ember> embers() {
    Rng rng = new Rng(EMBER_SEED);
    List<Ember> embers = new ArrayList<>(EMBER_COUNT);
    for (int i = 0; i < EMBER_COUNT; i++) {
      double x = GATE_CX + (rng.next() - 0.5) * 14;
      double y = GATE_BASE_Y - 2 - rng.next() * 18;
      embers.add(new Ember(x, y, rng.next(), 0.35 + rng.next() * 0.5, 10 + rng.next() * 16));
    }
    return List.copyOf(embers);
  }

  /** Low haze over the valley floor, plus one band that hides the foot of the gate. */
  private static List<Mist> mist() {
    return List.of(
        new Mist(74, 4, 3.5, 0.10, new Color(96, 96, 150)),
        new Mist(80, 3, 5.5, 0.13, new Color(120, 106, 164)),
        new Mist(88, 3, 8.0, 0.09, new Color(80, 74, 128)));
  }
}
