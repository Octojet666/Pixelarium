package studio.pixelarium.forge;

import java.util.ArrayList;
import java.util.List;
import studio.pixelarium.forge.OpeningData.Ember;
import studio.pixelarium.forge.OpeningData.Layer;
import studio.pixelarium.forge.OpeningData.Letter;
import studio.pixelarium.forge.OpeningData.Mist;
import studio.pixelarium.forge.OpeningData.Wordmark;
import studio.pixelarium.forge.SceneData.Peak;
import studio.pixelarium.forge.SceneData.SkyStop;
import studio.pixelarium.forge.SceneData.Star;

/**
 * Rejects opening-scene data that would fail silently in the browser.
 *
 * <p>Same posture as {@link SceneValidator}: every check here corresponds to a mistake that renders
 * without an error — a title that runs off the canvas, an ember seeded below the valley floor, a gate
 * whose arch clips the top of the frame.
 */
public final class OpeningValidator {

  private OpeningValidator() {}

  public static List<String> validate(OpeningData scene) {
    List<String> problems = new ArrayList<>();
    OpeningData.Settings settings = scene.settings();
    int width = settings.width();
    int height = settings.height();

    if (width < 32 || height < 32) {
      problems.add("canvas " + width + "x" + height + " is too small for a title screen");
    }
    if (settings.horizon() < 8 || settings.horizon() >= height) {
      problems.add("horizon " + settings.horizon() + " must sit inside the canvas");
    }
    if (settings.fps() < 10 || settings.fps() > 60) {
      problems.add("fps " + settings.fps() + " is outside 10..60");
    }
    if (settings.drift() < 0 || settings.drift() > 8) {
      problems.add("drift " + settings.drift() + " would slide the cliffs off the frame (0..8)");
    }

    paletteRamp(scene.palette().skyStops(), problems);

    for (Layer layer : scene.layers()) {
      if (layer.parallax() < 0 || layer.parallax() > 1.2) {
        problems.add("layer '" + layer.name() + "' parallax " + layer.parallax() + " is outside 0..1.2");
      }
      if (layer.baseY() < settings.horizon() || layer.baseY() > height + 12) {
        problems.add("layer '" + layer.name() + "' baseY " + layer.baseY() + " is outside the valley");
      }
      if (layer.peaks().isEmpty()) {
        problems.add("layer '" + layer.name() + "' has no peaks and would never paint");
      }
      for (Peak peak : layer.peaks()) {
        if (peak.height() <= 0 || peak.spread() <= 0) {
          problems.add("layer '" + layer.name() + "' has a peak with non-positive height/spread");
        }
        if (peak.x() + peak.spread() < 0 || peak.x() - peak.spread() > width) {
          problems.add("layer '" + layer.name() + "' has a peak fully off-canvas at x=" + peak.x());
        }
      }
    }

    for (Star star : scene.stars()) {
      if (star.x() < 0 || star.y() < 0 || star.x() >= width || star.y() >= height) {
        problems.add("star at " + star.x() + "," + star.y() + " is outside the canvas");
      } else if (star.y() >= settings.horizon()) {
        problems.add("star at " + star.x() + "," + star.y() + " is below the sky and would never draw");
      }
    }

    OpeningData.Gate gate = scene.gate();
    if (gate.thickness() <= 0 || gate.radius() <= gate.thickness()) {
      problems.add("gate needs radius > thickness > 0 (radius=" + gate.radius() + ", thickness=" + gate.thickness() + ")");
    }
    if (gate.cx() - gate.radius() < 0 || gate.cx() + gate.radius() >= width) {
      problems.add("gate does not fit horizontally at cx=" + gate.cx());
    }
    if (gate.rise() < gate.thickness()) {
      problems.add("gate rise " + gate.rise() + " leaves no pillar below the arch springline");
    }
    if (gate.baseY() - gate.rise() - gate.radius() < 2) {
      problems.add("gate arch would clip the top of the frame");
    }
    if (gate.baseY() > height) {
      problems.add("gate stands below the bottom edge");
    }

    OpeningData.Path path = scene.path();
    if (path.topY() < gate.baseY() - 2) {
      problems.add("path starts above the gate floor and would paint over it");
    }
    if (path.bottomY() > height || path.topY() >= path.bottomY()) {
      problems.add("path must run from its top to the bottom edge");
    }
    if (path.topHalf() <= 0 || path.bottomHalf() < path.topHalf()) {
      problems.add("path must widen towards the viewer");
    }

    for (Ember ember : scene.embers()) {
      if (ember.x() < 0 || ember.x() >= width || ember.y() < 0 || ember.y() >= height) {
        problems.add("ember at " + ember.x() + "," + ember.y() + " is outside the canvas");
      }
      if (ember.rise() <= 0) {
        problems.add("ember with rise " + ember.rise() + " would never move");
      }
    }

    for (Mist band : scene.mist()) {
      if (band.alpha() < 0 || band.alpha() > 1) {
        problems.add("mist alpha " + band.alpha() + " is outside 0..1");
      }
      if (band.thickness() < 1) {
        problems.add("mist band at y=" + band.y() + " has no thickness");
      }
    }

    wordmark(scene.wordmark(), width, height, problems);
    return problems;
  }

  private static void paletteRamp(List<SkyStop> stops, List<String> problems) {
    if (stops.size() < 2) {
      problems.add("sky ramp needs at least two stops");
      return;
    }
    if (stops.get(0).at() != 0) {
      problems.add("sky ramp must start at 0");
    }
    for (int i = 1; i < stops.size(); i++) {
      if (stops.get(i).at() <= stops.get(i - 1).at()) {
        problems.add("sky ramp stops are not strictly increasing at index " + i);
      }
    }
    if (stops.get(stops.size() - 1).at() != 1) {
      problems.add("sky ramp must end at 1");
    }
  }

  private static void wordmark(Wordmark wordmark, int width, int height, List<String> problems) {
    if (wordmark.letters().size() != wordmark.text().length()) {
      problems.add("wordmark has " + wordmark.letters().size() + " letters for text '" + wordmark.text() + "'");
    }
    int right = wordmark.x();
    for (Letter letter : wordmark.letters()) {
      if (letter.x() < 0 || letter.x() + wordmark.letterWidth() > width) {
        problems.add("letter '" + letter.ch() + "' falls outside the canvas horizontally");
      }
      if (letter.y() < 0 || letter.y() + wordmark.letterHeight() > height) {
        problems.add("letter '" + letter.ch() + "' falls outside the canvas vertically");
      }
      if (letter.runs().length == 0) {
        problems.add("letter '" + letter.ch() + "' has no pixels");
      }
      for (int[] run : letter.runs()) {
        if (run.length != 4) {
          problems.add("letter '" + letter.ch() + "' has a malformed run");
          continue;
        }
        if (run[0] < 0 || run[1] < 0 || run[0] + run[2] > wordmark.letterWidth()
            || run[1] + run[3] > wordmark.letterHeight()) {
          problems.add("letter '" + letter.ch() + "' has a run outside its cell");
        }
      }
      right = Math.max(right, letter.x() + wordmark.letterWidth());
    }
    if (right > width) {
      problems.add("wordmark runs past the right edge (ends at " + right + ")");
    }
  }
}
