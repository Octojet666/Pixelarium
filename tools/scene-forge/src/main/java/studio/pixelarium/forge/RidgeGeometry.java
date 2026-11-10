package studio.pixelarium.forge;

import java.util.List;
import studio.pixelarium.forge.SceneData.Peak;
import studio.pixelarium.forge.SceneData.Ridge;

/**
 * Silhouette maths for a mountain range.
 *
 * <p>Shared by {@link FrameRenderer} (which paints the ridge) and {@link SceneValidator} (which checks
 * the composition): when two places need to agree on where a mountain's edge is, they should not each
 * carry their own copy of the curve. The bend is a sine falloff raised to 1.35, which gives peaks a
 * slightly flat summit instead of a perfect cone.</p>
 */
public final class RidgeGeometry {

  private static final double SUMMIT_FLATNESS = 1.35;

  private RidgeGeometry() {}

  /** One column of the ridgeline: the first row, top-down, that the mountain occupies. */
  public static int top(int x, Ridge ridge) {
    return top(x, ridge.peaks(), (int) Math.round(ridge.baseY()));
  }

  /**
   * The ridge curve for a bare peak list.
   *
   * <p>The opening scene layers ridges with their own parallax and cannot use {@link Ridge} (which
   * carries a name and colours), so the curve is available on its own. Both callers must agree on the
   * shape, and this is the single place that decides it.</p>
   */
  public static int top(int x, List<Peak> peaks, int baseY) {
    int top = baseY + 1;
    for (Peak peak : peaks) {
      double distance = Math.abs(x - peak.x());
      if (distance > peak.spread()) continue;
      double t = 1 - distance / peak.spread();
      int y = baseY - (int) Math.round(peak.height() * Math.pow(Math.sin(t * Math.PI / 2), SUMMIT_FLATNESS));
      if (y < top) top = y;
    }
    return top;
  }

  /** The whole ridgeline across the canvas width. */
  public static int[] profile(Ridge ridge, int width) {
    int[] tops = new int[width];
    for (int x = 0; x < width; x++) tops[x] = top(x, ridge);
    return tops;
  }

  /** Slope at a column, used for the lit/shadow side chosen by the renderer. */
  public static int slope(int[] profile, int x) {
    int left = profile[Math.max(0, x - 1)];
    int right = profile[Math.min(profile.length - 1, x + 1)];
    return right - left;
  }

  /**
   * True when the mountain occupies this row at this column.
   *
   * <p>The lower bound matters: a range whose base sits on the waterline rises above rows *below* it in
   * raw numbers while painting nothing there, so a plain "top is above the row" test would report every
   * distant ridge as blocking the water.</p>
   */
  public static boolean covers(int[] profile, int x, int row, int baseY) {
    return row >= profile[x] && row < baseY;
  }

  /** True when the mountain occupies this row at this column, using the range's own base. */
  public static boolean covers(int[] profile, int x, int row, Ridge ridge) {
    return covers(profile, x, row, (int) Math.round(ridge.baseY()));
  }

  /** Number of columns where the range occupies {@code row}. */
  public static int coverage(int[] profile, int row, Ridge ridge) {
    int baseY = (int) Math.round(ridge.baseY());
    int covered = 0;
    for (int top : profile) {
      if (top <= row && row < baseY) covered++;
    }
    return covered;
  }

  /** Highest point of the range as a row index (smaller is higher). */
  public static int summit(int[] profile) {
    int best = Integer.MAX_VALUE;
    for (int top : profile) best = Math.min(best, top);
    return best;
  }
}
