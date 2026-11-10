package studio.pixelarium.forge;

import java.util.List;

/**
 * Immutable description of the landing-page hero scene ("Dusk Peaks").
 *
 * <p>This is the build-time source of truth for everything the browser cannot easily hand-tune: the
 * palette ramp, the two ridge silhouettes, and the seeded placement of stars, clouds, fireflies and
 * birds. It is serialised to {@code src/data/heroScene.json}, which the React component imports.</p>
 */
public record SceneData(
    Settings settings,
    Palette palette,
    Ridge farRidge,
    Ridge nearRidge,
    List<Star> stars,
    List<CloudBand> cloudBands,
    List<Firefly> fireflies,
    List<Bird> birds) {

  /** Canvas geometry and the animation cadence the renderer should aim for. */
  public record Settings(int width, int height, int horizon, int seed, int fps) {
    public int waterRows() {
      return height - horizon;
    }
  }

  /** An 8-bit RGB colour. Alpha is a render-time decision, never baked into the data. */
  public record Color(int r, int g, int b) {
    public Color mix(Color other, double t) {
      double clamped = Math.max(0, Math.min(1, t));
      return new Color(
          (int) Math.round(r + (other.r - r) * clamped),
          (int) Math.round(g + (other.g - g) * clamped),
          (int) Math.round(b + (other.b - b) * clamped));
    }
  }

  /** A gradient stop; {@code at} is 0..1 across the sky height. */
  public record SkyStop(double at, Color color) {}

  /** Every colour the scene needs, named by role rather than by count. */
  public record Palette(
      List<SkyStop> skyStops,
      Color sunCore,
      Color sunMid,
      Color sunOuter,
      Color sunHalo,
      Color moon,
      Color moonHighlight,
      Color moonHalo,
      Color starWarm,
      Color starCool,
      Color reflectionNear,
      Color reflectionFar,
      Color firefly,
      Color bird,
      Color waterTop,
      Color waterBottom,
      Color waterSheen) {

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

  /** One mountain in a range: apex column, height above the waterline and half-width. */
  public record Peak(double x, double height, double spread) {}

  /** A ridgeline: where it meets the water plus the three colours used to shade it. */
  public record Ridge(String name, double baseY, Color body, Color shade, Color rim, List<Peak> peaks) {}

  /** A twinkling star. {@code warm} picks between the two star colours. */
  public record Star(int x, int y, double phase, boolean warm) {}

  /** One cloud sprite, scrolled horizontally by the renderer. */
  public record Cloud(double x, double y, double rx, double ry, double speed) {}

  /**
   * A parallax band of clouds: higher bands move slower to sell depth. The colour and opacity live here
   * rather than in either renderer so the browser and the offline preview cannot drift apart.
   */
  public record CloudBand(
      String name,
      double yFrom,
      double yTo,
      int count,
      double speed,
      Color color,
      Color topColor,
      double alpha,
      boolean behindRidges,
      List<Cloud> clouds) {}

  /** A drifting glow in the lower third of the scene. */
  public record Firefly(double x, double y, double phase, double speed) {}

  /** A bird in the flock crossing the sky. */
  public record Bird(double start, double y, double speed, double phase) {}
}
