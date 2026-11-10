package studio.pixelarium.forge;

import java.util.ArrayList;
import java.util.List;
import studio.pixelarium.forge.SceneData.Bird;
import studio.pixelarium.forge.SceneData.Cloud;
import studio.pixelarium.forge.SceneData.CloudBand;
import studio.pixelarium.forge.SceneData.Firefly;
import studio.pixelarium.forge.SceneData.Peak;
import studio.pixelarium.forge.SceneData.Ridge;
import studio.pixelarium.forge.SceneData.SkyStop;
import studio.pixelarium.forge.SceneData.Star;

/**
 * Sanity checks on a generated scene.
 *
 * <p>The hero art fails quietly when its data is wrong: a star placed below the horizon simply never
 * draws, and a cloud band with a zero sink rate looks frozen. These checks turn those silent bugs into
 * a build failure. Every message names the field so a broken seed is easy to trace.</p>
 */
public final class SceneValidator {

  private SceneValidator() {}

  public static List<String> validate(SceneData scene) {
    List<String> problems = new ArrayList<>();
    int w = scene.settings().width();
    int h = scene.settings().height();
    int horizon = scene.settings().horizon();

    if (w < 16 || h < 16) problems.add("settings: canvas must be at least 16x16, got " + w + "x" + h);
    if (horizon <= 4 || horizon >= h) problems.add("settings: horizon must sit inside the canvas, got " + horizon);
    if (scene.settings().fps() < 10 || scene.settings().fps() > 60) {
      problems.add("settings: fps should stay in 10..60, got " + scene.settings().fps());
    }

    for (int i = 0; i < scene.palette().skyStops().size(); i++) {
      SkyStop stop = scene.palette().skyStops().get(i);
      if (stop.at() < 0 || stop.at() > 1) problems.add("palette.skyStops[" + i + "]: at must be 0..1");
      if (i > 0 && stop.at() <= scene.palette().skyStops().get(i - 1).at()) {
        problems.add("palette.skyStops[" + i + "]: stops must be strictly increasing");
      }
    }

    checkRidge("farRidge", scene.farRidge(), w, problems);
    checkRidge("nearRidge", scene.nearRidge(), w, problems);

    for (int i = 0; i < scene.stars().size(); i++) {
      Star star = scene.stars().get(i);
      if (star.x() < 0 || star.x() >= w || star.y() < 0) {
        problems.add("stars[" + i + "]: outside the canvas at (" + star.x() + ", " + star.y() + ")");
      }
      if (star.y() >= horizon) problems.add("stars[" + i + "]: below the horizon, it would never draw");
    }

    for (CloudBand band : scene.cloudBands()) {
      if (band.count() <= 0) problems.add("cloudBands." + band.name() + ": needs at least one cloud");
      if (band.speed() <= 0) problems.add("cloudBands." + band.name() + ": speed must be positive");
      if (band.alpha() <= 0 || band.alpha() > 1) problems.add("cloudBands." + band.name() + ": alpha must be 0..1");
      if (band.yTo() <= band.yFrom()) problems.add("cloudBands." + band.name() + ": yTo must exceed yFrom");
      if (band.clouds().size() != band.count()) {
        problems.add("cloudBands." + band.name() + ": count does not match the cloud list");
      }
      for (int i = 0; i < band.clouds().size(); i++) {
        Cloud cloud = band.clouds().get(i);
        if (cloud.rx() <= 0 || cloud.ry() <= 0) {
          problems.add("cloudBands." + band.name() + ".clouds[" + i + "]: radii must be positive");
        }
        if (cloud.y() < 0 || cloud.y() >= h) {
          problems.add("cloudBands." + band.name() + ".clouds[" + i + "]: y outside the canvas");
        }
        if (cloud.speed() <= 0) {
          problems.add("cloudBands." + band.name() + ".clouds[" + i + "]: speed must be positive");
        }
      }
    }

    for (int i = 0; i < scene.fireflies().size(); i++) {
      Firefly fly = scene.fireflies().get(i);
      if (fly.x() < 0 || fly.x() >= w || fly.y() < 0 || fly.y() >= h) {
        problems.add("fireflies[" + i + "]: outside the canvas");
      }
      if (fly.speed() <= 0) problems.add("fireflies[" + i + "]: speed must be positive");
    }

    for (int i = 0; i < scene.birds().size(); i++) {
      Bird bird = scene.birds().get(i);
      if (bird.speed() <= 0) problems.add("birds[" + i + "]: speed must be positive");
      if (bird.y() < 0 || bird.y() >= horizon) problems.add("birds[" + i + "]: must fly above the horizon");
    }

    checkComposition(scene, problems);
    return problems;
  }

  /**
   * Composition checks that pure bounds checks miss: the scene must actually read as a dusk bay.
   *
   * <p>A ridge that spans the whole waterline hides the water and with it the sun's reflection, which is
   * the focal point of the artwork; a ridge that never rises makes the horizon look unfinished; and a
   * ridge whose body colour is too close to the water loses its silhouette entirely. None of these throw
   * or look broken in code — they just make the picture worse.</p>
   */
  private static void checkComposition(SceneData scene, List<String> problems) {
    int width = scene.settings().width();
    int horizon = scene.settings().horizon();

    int[] far = RidgeGeometry.profile(scene.farRidge(), width);
    int[] near = RidgeGeometry.profile(scene.nearRidge(), width);

    int farAtWater = RidgeGeometry.coverage(far, horizon, scene.farRidge());
    int nearAtWater = RidgeGeometry.coverage(near, horizon, scene.nearRidge());

    // The bay is measured inside the water, not at the waterline: the distant ridge stands *on* the
    // horizon by design, so only ranges whose base reaches into the water can close it off.
    int midWater = horizon + Math.max(1, (scene.settings().height() - horizon) / 3);
    int openColumns = 0;
    for (int x = 0; x < width; x++) {
      boolean blocked = RidgeGeometry.covers(far, x, midWater, scene.farRidge())
          || RidgeGeometry.covers(near, x, midWater, scene.nearRidge());
      if (!blocked) openColumns++;
    }
    int minimumBay = Math.max(4, Math.round(width * 0.15f));
    if (openColumns < minimumBay) {
      problems.add("composition: the bay is only " + openColumns + " columns wide, needs at least " + minimumBay
          + " so the water and its reflection stay visible");
    }
    if (farAtWater + nearAtWater == 0) {
      problems.add("composition: no ridge reaches the waterline, the horizon will look unfinished");
    }

    double tallest = Math.max(
        (double) horizon - RidgeGeometry.summit(far), (double) scene.settings().height() - RidgeGeometry.summit(near));
    if (tallest < horizon * 0.2) {
      problems.add("composition: the tallest peak is only " + Math.round(tallest) + " rows; the skyline will read flat");
    }

  }

  private static void checkRidge(String label, Ridge ridge, int width, List<String> problems) {
    if (ridge.baseY() <= 0) problems.add(label + ": baseY must be positive");
    if (ridge.peaks().isEmpty()) problems.add(label + ": needs at least one peak");
    for (int i = 0; i < ridge.peaks().size(); i++) {
      Peak peak = ridge.peaks().get(i);
      if (peak.spread() <= 0) problems.add(label + ".peaks[" + i + "]: spread must be positive");
      if (peak.height() <= 0) problems.add(label + ".peaks[" + i + "]: height must be positive");
      if (peak.x() < -peak.spread() || peak.x() > width + peak.spread()) {
        problems.add(label + ".peaks[" + i + "]: is off the canvas entirely");
      }
    }
  }
}
