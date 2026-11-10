package studio.pixelarium.forge;

import java.util.ArrayList;
import java.util.List;
import studio.pixelarium.forge.SceneData.Bird;
import studio.pixelarium.forge.SceneData.Cloud;
import studio.pixelarium.forge.SceneData.CloudBand;
import studio.pixelarium.forge.SceneData.Color;
import studio.pixelarium.forge.SceneData.Firefly;
import studio.pixelarium.forge.SceneData.Palette;
import studio.pixelarium.forge.SceneData.Peak;
import studio.pixelarium.forge.SceneData.Ridge;
import studio.pixelarium.forge.SceneData.Settings;
import studio.pixelarium.forge.SceneData.SkyStop;
import studio.pixelarium.forge.SceneData.Star;

/**
 * Builds the hero scene deterministically from a seed.
 *
 * <p>The seeds below are part of the art direction, not noise: each one was chosen so its starfield,
 * cloud placement and camber look balanced, and they must never be changed casually. Because the PRNG
 * matches the JavaScript one, regenerating with the same seeds reproduces the layout the app used to
 * compute at runtime.</p>
 */
public final class SceneLayout {

  public static final int WIDTH = 64;
  public static final int HEIGHT = 64;
  public static final int HORIZON = 45;
  public static final int FPS = 20;
  public static final int DEFAULT_SEED = 20261108;

  private static final int STAR_SEED = 20240607;
  private static final int STAR_COUNT = 54;
  private static final int FIREFLY_SEED = 90210;
  private static final int FIREFLY_COUNT = 13;
  private static final int BIRD_SEED = 4242;
  private static final int BIRD_COUNT = 4;

  private SceneLayout() {}

  public static SceneData build(int seed) {
    return new SceneData(
        new Settings(WIDTH, HEIGHT, HORIZON, seed, FPS),
        palette(),
        farRidge(),
        nearRidge(),
        stars(),
        List.of(
            cloudBand("high", 777, 5, 13, 21, 1.4, new Color(84, 42, 32), new Color(122, 61, 43), 0.45, true),
            cloudBand("mid", 313, 4, 26, 32, 2.4, new Color(104, 52, 36), new Color(148, 74, 46), 0.40, true),
            cloudBand("low", 991, 4, 33, 39, 3.2, new Color(150, 82, 46), new Color(196, 112, 58), 0.24, false)),
        fireflies(),
        birds());
  }

  /** The dusk ramp, warmest at the waterline. */
  public static Palette palette() {
    return new Palette(
        List.of(
            new SkyStop(0.00, new Color(11, 8, 16)),
            new SkyStop(0.35, new Color(28, 17, 25)),
            new SkyStop(0.62, new Color(74, 34, 32)),
            new SkyStop(0.82, new Color(143, 65, 34)),
            new SkyStop(1.00, new Color(196, 106, 42))),
        new Color(255, 241, 201), // sunCore
        new Color(255, 209, 102), // sunMid
        new Color(237, 163, 60),  // sunOuter
        new Color(209, 120, 44),  // sunHalo
        new Color(214, 220, 236), // moon
        new Color(246, 248, 255), // moonHighlight
        new Color(190, 205, 235), // moonHalo
        new Color(255, 241, 201), // starWarm
        new Color(194, 177, 131), // starCool
        new Color(255, 196, 108), // reflectionNear
        new Color(214, 122, 54),  // reflectionFar
        new Color(255, 226, 150), // firefly
        new Color(26, 16, 15),    // bird
        new Color(78, 40, 30),    // waterTop
        new Color(19, 12, 13),    // waterBottom
        new Color(112, 56, 36));  // waterSheen
  }

  /** Distant range: short, hazy peaks that stand on the waterline. */
  public static Ridge farRidge() {
    return new Ridge(
        "far",
        HORIZON,
        new Color(74, 37, 25),
        new Color(44, 22, 17),
        new Color(143, 65, 34),
        List.of(
            new Peak(5, 14, 15),
            new Peak(29, 8, 13),
            new Peak(52, 16, 17),
            new Peak(64, 12, 12)));
  }

  /** Foreground range: near-black silhouettes that frame the bay. */
  public static Ridge nearRidge() {
    return new Ridge(
        "near",
        HEIGHT,
        new Color(27, 15, 13),
        new Color(14, 9, 8),
        new Color(78, 37, 24),
        List.of(new Peak(2, 20, 19), new Peak(62, 22, 18)));
  }

  private static List<Star> stars() {
    Rng rng = new Rng(STAR_SEED);
    List<Star> stars = new ArrayList<>(STAR_COUNT);
    for (int i = 0; i < STAR_COUNT; i++) {
      int x = rng.intBelow(WIDTH);
      int y = rng.intBelow(30);
      double phase = rng.next() * Math.PI * 2;
      boolean warm = rng.next() < 0.25;
      stars.add(new Star(x, y, phase, warm));
    }
    return List.copyOf(stars);
  }

  static CloudBand cloudBand(
      String name,
      int seed,
      int count,
      double yFrom,
      double yTo,
      double speed,
      Color color,
      Color topColor,
      double alpha,
      boolean behindRidges) {
    Rng rng = new Rng(seed);
    List<Cloud> clouds = new ArrayList<>(count);
    for (int i = 0; i < count; i++) {
      clouds.add(
          new Cloud(
              rng.next() * WIDTH,
              yFrom + rng.next() * (yTo - yFrom),
              6 + rng.next() * 4,
              1 + rng.next() * 0.8,
              speed));
    }
    return new CloudBand(name, yFrom, yTo, count, speed, color, topColor, alpha, behindRidges, List.copyOf(clouds));
  }

  private static List<Firefly> fireflies() {
    Rng rng = new Rng(FIREFLY_SEED);
    List<Firefly> flies = new ArrayList<>(FIREFLY_COUNT);
    for (int i = 0; i < FIREFLY_COUNT; i++) {
      flies.add(
          new Firefly(
              5 + rng.next() * 54,
              46 + rng.next() * 16,
              rng.next() * Math.PI * 2,
              0.6 + rng.next() * 0.8));
    }
    return List.copyOf(flies);
  }

  private static List<Bird> birds() {
    Rng rng = new Rng(BIRD_SEED);
    List<Bird> birds = new ArrayList<>(BIRD_COUNT);
    for (int i = 0; i < BIRD_COUNT; i++) {
      birds.add(
          new Bird(
              rng.next() * 120,
              10 + rng.next() * 9,
              5 + rng.next() * 3,
              rng.next() * Math.PI * 2));
    }
    return List.copyOf(birds);
  }
}
