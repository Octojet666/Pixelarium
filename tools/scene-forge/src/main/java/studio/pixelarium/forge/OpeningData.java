package studio.pixelarium.forge;

import java.util.List;
import studio.pixelarium.forge.SceneData.Color;
import studio.pixelarium.forge.SceneData.Peak;
import studio.pixelarium.forge.SceneData.SkyStop;
import studio.pixelarium.forge.SceneData.Star;

/**
 * Immutable description of the opening title scene ("Ember Gate").
 *
 * <p>The landing hero is a calm dusk lake; the opening is the other half of the art direction: a
 * night valley framed by two cliffs, a lit stone gate in the middle, and the studio wordmark across
 * the sky. It is serialised to {@code src/data/openingScene.json} and drawn by
 * {@code src/components/OpeningScene.tsx}; the same rules drive {@link OpeningRenderer} so the frames
 * the tool renders offline are the frames the browser paints.</p>
 *
 * <p>Timing lives in the browser, exactly like the hero: this file holds composition only, never a
 * clock.</p>
 */
public record OpeningData(
    Settings settings,
    Palette palette,
    List<Layer> layers,
    List<Star> stars,
    Gate gate,
    Path path,
    List<Ember> embers,
    List<Mist> mist,
    Wordmark wordmark) {

  /** Canvas size, sky height, cadence, and how far the parallax camera drifts at most. */
  public record Settings(int width, int height, int horizon, int seed, int fps, double drift) {}

  /** Colours by role. {@code skyAt} is shared with the hero so both skies interpolate the same way. */
  public record Palette(
      List<SkyStop> skyStops,
      Color moon,
      Color moonHighlight,
      Color moonHalo,
      Color starCool,
      Color starWarm,
      Color mist,
      Color ember,
      Color emberHot,
      Color ground,
      Color groundShade,
      Color glyph,
      Color glyphShadow,
      Color glyphGlow) {

    /** Sky colour at a row, interpolating the ramp and clamping outside it. */
    public Color skyAt(double y, int horizon) {
      double t = Math.max(0, Math.min(1, y / (horizon - 1)));
      for (int i = 0; i < skyStops.size() - 1; i++) {
        SkyStop current = skyStops.get(i);
        SkyStop next = skyStops.get(i + 1);
        if (t <= next.at()) {
          double span = next.at() - current.at();
          return current.color().mix(next.color(), span <= 0 ? 0 : (t - current.at()) / span);
        }
      }
      return skyStops.get(skyStops.size() - 1).color();
    }
  }

  /**
   * A ridge silhouette with its own parallax factor. {@code parallax} is a multiplier on the camera
   * drift: 0 pins a range to the sky, 1 moves it with the foreground.
   */
  public record Layer(
      String name,
      double baseY,
      Color body,
      Color shade,
      Color rim,
      double parallax,
      List<Peak> peaks) {}

  /**
   * The stone gate: two pillars carrying a half-ring, centred on {@code cx} and standing on
   * {@code baseY}. {@code rise} is how far the arch springs above the floor, so the pillars have a
   * height of their own instead of the gate being a perfect circle; the glow is painted inside the
   * opening, so the same geometry drives the hole and the light behind it.
   */
  public record Gate(
      int cx,
      double baseY,
      int radius,
      int thickness,
      int rise,
      Color stone,
      Color stoneShade,
      Color stoneRim,
      Color glowCore,
      Color glowMid,
      Color glowEdge) {}

  /** The path from the gate down to the bottom edge of the frame. */
  public record Path(
      double cx,
      int topY,
      double topHalf,
      int bottomY,
      double bottomHalf,
      Color color,
      Color edge) {}

  /** A mote of light rising out of the gate. {@code rise} is in pixels over one full cycle. */
  public record Ember(double x, double y, double phase, double speed, double rise) {}

  /** A horizontal band of drifting haze. */
  public record Mist(double y, double thickness, double speed, double alpha, Color color) {}

  /** One letter of the wordmark: {@code runs} are merged horizontal pixel spans, {x, y, w, h}. */
  public record Letter(char ch, int x, int y, int[][] runs) {}

  /** The title lettering, positioned and pre-rasterised so the browser never needs font data. */
  public record Wordmark(
      String text,
      int x,
      int y,
      int letterWidth,
      int letterHeight,
      int letterGap,
      List<Letter> letters) {}
}
