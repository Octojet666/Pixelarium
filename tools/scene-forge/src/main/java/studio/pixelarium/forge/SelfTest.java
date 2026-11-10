package studio.pixelarium.forge;

import java.util.ArrayList;
import java.util.List;
import studio.pixelarium.forge.SceneData.Cloud;
import studio.pixelarium.forge.SceneData.CloudBand;
import studio.pixelarium.forge.SceneData.Color;
import studio.pixelarium.forge.SceneData.Peak;
import studio.pixelarium.forge.SceneData.Ridge;

/**
 * Self-tests for the scene forge, runnable without a build tool or test framework.
 *
 * <p>Kept in the tool rather than in the app because everything under test is Java: the PRNG must stay
 * bit-compatible with the browser, generated data must round-trip through the reader, the validator must
 * actually reject broken data, and the renderer must keep moving. Run with {@code --self-test}; any
 * failure exits non-zero so it can gate a commit.</p>
 */
public final class SelfTest {

  private static int passed;
  private static int failed;

  private SelfTest() {}

  public static int run() {
    passed = 0;
    failed = 0;

    rngMatchesKnownStream();
    generationIsDeterministic();
    jsonRoundTrips();
    readerRejectsGarbage();
    validatorRejectsBrokenData();
    validatorCatchesAClosedBay();
    validatorAcceptsGeneratedData();
    rendererKeepsMoving();
    rendererStaysInsideTheCanvas();
    pngEncodesAValidHeader();
    goldenFramesAreStable();
    openingDataPassesValidation();
    openingValidatorRejectsBrokenGate();
    openingGlyphsRasterise();
    openingFramesKeepMoving();
    openingWordmarkIsPainted();
    openingGoldenFrameIsStable();

    System.out.println("self-test: " + passed + " passed, " + failed + " failed");
    return failed == 0 ? 0 : 1;
  }

  /* ------------------------------------------------------------------ */
  /* Generator                                                           */
  /* ------------------------------------------------------------------ */

  /** Values produced by mulberry32(1); a mismatch means the port drifted from the web app. */
  private static void rngMatchesKnownStream() {
    Rng rng = new Rng(1);
    double[] expected = {
      0.6270739405881613, 0.002735721180215478, 0.5274470399599522, 0.9810509674716741, 0.9683778982143849
    };
    StringBuilder actual = new StringBuilder();
    boolean ok = true;
    for (int i = 0; i < expected.length; i++) {
      double value = rng.next();
      actual.append(value).append(' ');
      if (Math.abs(value - expected[i]) > 1e-12) ok = false;
    }
    check("rng matches mulberry32(1)", ok, "got " + actual.toString().trim());
  }

  private static void generationIsDeterministic() {
    SceneData first = SceneLayout.build(SceneLayout.DEFAULT_SEED);
    SceneData second = SceneLayout.build(SceneLayout.DEFAULT_SEED);
    check(
        "same seed produces the same JSON",
        JsonWriter.toJson(first).equals(JsonWriter.toJson(second)),
        "two builds differed");

    SceneData other = SceneLayout.build(SceneLayout.DEFAULT_SEED + 1);
    check(
        "a different seed re-rolls the layout",
        !JsonWriter.toJson(other).equals(JsonWriter.toJson(first)),
        "different seeds produced identical data");
  }

  private static void jsonRoundTrips() {
    SceneData scene = SceneLayout.build(SceneLayout.DEFAULT_SEED);
    String json = JsonWriter.toJson(scene);
    try {
      SceneData parsed = JsonReader.read(json);
      check("JSON round-trips through the reader", JsonWriter.toJson(parsed).equals(json), "re-encoded JSON differed");
      check(
          "round-trip keeps the counts",
          parsed.stars().size() == scene.stars().size()
              && parsed.cloudBands().size() == scene.cloudBands().size()
              && parsed.fireflies().size() == scene.fireflies().size()
              && parsed.birds().size() == scene.birds().size(),
          "collection sizes changed");
    } catch (RuntimeException error) {
      check("JSON round-trips through the reader", false, error.getMessage());
    }
  }

  private static void readerRejectsGarbage() {
    String[] bad = {"", "[]", "{\"settings\": {}}", "{\"a\": 1,}", "{\"a\": tru}"};
    int rejected = 0;
    for (String candidate : bad) {
      try {
        JsonReader.read(candidate);
      } catch (RuntimeException error) {
        rejected++;
      }
    }
    check("reader rejects malformed JSON", rejected == bad.length, rejected + "/" + bad.length + " rejected");
  }

  /* ------------------------------------------------------------------ */
  /* Validator                                                           */
  /* ------------------------------------------------------------------ */

  private static void validatorRejectsBrokenData() {
    SceneData scene = SceneLayout.build(SceneLayout.DEFAULT_SEED);

    List<SceneData.Star> sunkStars = new ArrayList<>(scene.stars());
    sunkStars.add(new SceneData.Star(4, scene.settings().horizon() + 2, 0, false));
    SceneData starBelowHorizon = withStars(scene, sunkStars);
    check(
        "validator catches a star below the horizon",
        SceneValidator.validate(starBelowHorizon).stream().anyMatch(problem -> problem.startsWith("stars")),
        "no star problem reported");

    List<CloudBand> brokenBands = new ArrayList<>();
    for (CloudBand band : scene.cloudBands()) {
      if (!band.name().equals("high")) brokenBands.add(band);
    }
    CloudBand frozen =
        new CloudBand("high", 13, 21, 1, 0, new Color(1, 2, 3), new Color(4, 5, 6), 0.4, true, List.of(new Cloud(1, 15, 6, 1, 0)));
    brokenBands.add(frozen);
    SceneData frozenBand = withBands(scene, brokenBands);
    check(
        "validator catches a frozen cloud band",
        SceneValidator.validate(frozenBand).stream().anyMatch(problem -> problem.contains("speed must be positive")),
        "zero speed was accepted");

    Ridge noPeaks = new Ridge("far", 45, new Color(1, 1, 1), new Color(2, 2, 2), new Color(3, 3, 3), List.of());
    SceneData emptyRidge =
        new SceneData(
            scene.settings(),
            scene.palette(),
            noPeaks,
            scene.nearRidge(),
            scene.stars(),
            scene.cloudBands(),
            scene.fireflies(),
            scene.birds());
    check(
        "validator catches a ridge without peaks",
        SceneValidator.validate(emptyRidge).stream().anyMatch(problem -> problem.contains("at least one peak")),
        "empty ridge was accepted");

    Ridge badPeak =
        new Ridge("far", 45, new Color(1, 1, 1), new Color(2, 2, 2), new Color(3, 3, 3), List.of(new Peak(10, 0, 5)));
    SceneData flatPeak =
        new SceneData(
            scene.settings(),
            scene.palette(),
            badPeak,
            scene.nearRidge(),
            scene.stars(),
            scene.cloudBands(),
            scene.fireflies(),
            scene.birds());
    check(
        "validator catches a zero-height peak",
        SceneValidator.validate(flatPeak).stream().anyMatch(problem -> problem.contains("height must be positive")),
        "zero height was accepted");
  }

  private static void validatorCatchesAClosedBay() {
    SceneData scene = SceneLayout.build(SceneLayout.DEFAULT_SEED);
    // A foreground range that spans the whole width and dips past the waterline closes the bay.
    Ridge wall =
        new Ridge(
            "near",
            scene.settings().height(),
            new Color(27, 15, 13),
            new Color(14, 9, 8),
            new Color(78, 37, 24),
            List.of(new Peak(32, 30, 90)));
    SceneData closed =
        new SceneData(
            scene.settings(),
            scene.palette(),
            scene.farRidge(),
            wall,
            scene.stars(),
            scene.cloudBands(),
            scene.fireflies(),
            scene.birds());
    check(
        "validator catches a ridge that hides the water",
        SceneValidator.validate(closed).stream().anyMatch(problem -> problem.contains("bay is only")),
        "a fully walled horizon was accepted");
  }

  private static void validatorAcceptsGeneratedData() {
    List<String> problems = SceneValidator.validate(SceneLayout.build(SceneLayout.DEFAULT_SEED));
    check("generated data passes validation", problems.isEmpty(), String.join("; ", problems));
  }

  /* ------------------------------------------------------------------ */
  /* Renderer                                                            */
  /* ------------------------------------------------------------------ */

  private static void rendererKeepsMoving() {
    FrameRenderer renderer = new FrameRenderer(SceneLayout.build(SceneLayout.DEFAULT_SEED));
    double[] times = {0, 1000, 4000, 16000, 48000};
    boolean allMoved = true;
    StringBuilder detail = new StringBuilder();
    for (int i = 1; i < times.length; i++) {
      double ratio = diffRatio(renderer.render(times[i - 1]), renderer.render(times[i]));
      detail.append(String.format("%.1f%% ", ratio * 100));
      if (ratio < 0.004) allMoved = false;
    }
    check("frames differ over the animation cycle", allMoved, "changed pixels: " + detail.toString().trim());
  }

  private static void rendererStaysInsideTheCanvas() {
    SceneData scene = SceneLayout.build(SceneLayout.DEFAULT_SEED);
    FrameRenderer renderer = new FrameRenderer(scene);
    byte[] frame = renderer.render(7000);
    boolean opaque = true;
    for (int i = 3; i < frame.length; i += 4) {
      if ((frame[i] & 0xFF) != 255) {
        opaque = false;
        break;
      }
    }
    check(
        "rendered frames are fully opaque at the document size",
        opaque && frame.length == scene.settings().width() * scene.settings().height() * 4,
        "found a non-opaque pixel");
  }

  private static void pngEncodesAValidHeader() {
    byte[] rgba = bytes(255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 255, 255, 255, 255);
    try {
      byte[] png = PngWriter.encode(rgba, 2, 2, 3);
      boolean signature = png.length > 8 && (png[0] & 0xFF) == 0x89 && png[1] == 'P' && png[2] == 'N' && png[3] == 'G';
      int width = readInt(png, 16);
      int height = readInt(png, 20);
      int colourType = png[25] & 0xFF;
      boolean endChunk = new String(png, png.length - 8, 4, java.nio.charset.StandardCharsets.US_ASCII).equals("IEND");
      check(
          "PNG encoder writes a valid header",
          signature && width == 6 && height == 6 && colourType == 6 && endChunk,
          "w=" + width + " h=" + height + " type=" + colourType + " iend=" + endChunk);
    } catch (Exception error) {
      check("PNG encoder writes a valid header", false, error.getMessage());
    }
  }

  /** Locks the look: a refactor that changes these hashes changed the artwork. */
  private static void goldenFramesAreStable() {
    FrameRenderer renderer = new FrameRenderer(SceneLayout.build(SceneLayout.DEFAULT_SEED));
    long opening = hash(renderer.render(0));
    long later = hash(renderer.render(24000));
    check(
        "golden frame at t=0 is unchanged",
        opening == GOLDEN_T0,
        "expected " + GOLDEN_T0 + " but rendered " + opening + " (update the constant if the art changed on purpose)");
    check(
        "golden frame at t=24000 is unchanged",
        later == GOLDEN_T24S,
        "expected " + GOLDEN_T24S + " but rendered " + later + " (update the constant if the art changed on purpose)");
  }

  private static final long GOLDEN_T0 = 1364603989842191705L;
  private static final long GOLDEN_T24S = -7513452898629408492L;

  /* ------------------------------------------------------------------ */
  /* Helpers                                                             */
  /* ------------------------------------------------------------------ */

  private static SceneData withStars(SceneData scene, List<SceneData.Star> stars) {
    return new SceneData(
        scene.settings(),
        scene.palette(),
        scene.farRidge(),
        scene.nearRidge(),
        List.copyOf(stars),
        scene.cloudBands(),
        scene.fireflies(),
        scene.birds());
  }

  private static SceneData withBands(SceneData scene, List<CloudBand> bands) {
    return new SceneData(
        scene.settings(),
        scene.palette(),
        scene.farRidge(),
        scene.nearRidge(),
        scene.stars(),
        List.copyOf(bands),
        scene.fireflies(),
        scene.birds());
  }

  /* ------------------------------------------------------------------ */
  /* Opening scene                                                       */
  /* ------------------------------------------------------------------ */

  private static void openingDataPassesValidation() {
    List<String> problems = OpeningValidator.validate(OpeningLayout.build(OpeningLayout.DEFAULT_SEED));
    check("opening data passes validation", problems.isEmpty(), String.join("; ", problems));
  }

  private static void openingValidatorRejectsBrokenGate() {
    OpeningData scene = OpeningLayout.build(OpeningLayout.DEFAULT_SEED);
    OpeningData.Gate gate = scene.gate();

    OpeningData flatArch = withGate(
        scene, new OpeningData.Gate(gate.cx(), gate.baseY(), gate.radius(), gate.thickness(), 0,
            gate.stone(), gate.stoneShade(), gate.stoneRim(), gate.glowCore(), gate.glowMid(), gate.glowEdge()));
    boolean riseRejected = OpeningValidator.validate(flatArch).stream().anyMatch(p -> p.contains("pillar"));

    OpeningData tooWide = withGate(
        scene, new OpeningData.Gate(4, gate.baseY(), gate.radius(), gate.thickness(), gate.rise(),
            gate.stone(), gate.stoneShade(), gate.stoneRim(), gate.glowCore(), gate.glowMid(), gate.glowEdge()));
    boolean widthRejected = OpeningValidator.validate(tooWide).stream().anyMatch(p -> p.contains("horizontally"));

    check("opening validator rejects a gate with no pillars", riseRejected, "rise=0 passed");
    check("opening validator rejects a gate off the canvas", widthRejected, "cx=4 passed");
  }

  /** Every glyph must rasterise to spans covering exactly its lit pixels, and unknown letters must fail. */
  private static void openingGlyphsRasterise() {
    boolean ok = true;
    StringBuilder detail = new StringBuilder();
    for (char ch : OpeningLayout.TITLE.toCharArray()) {
      int area = 0;
      for (int[] run : Glyphs.runs(ch)) {
        area += run[2] * run[3];
        if (run[0] < 0 || run[1] < 0 || run[0] + run[2] > Glyphs.WIDTH || run[1] + run[3] > Glyphs.HEIGHT) {
          ok = false;
          detail.append(ch).append(":run-outside-cell ");
        }
      }
      if (area != Glyphs.pixelCount(ch)) {
        ok = false;
        detail.append(ch).append('=').append(area).append('/').append(Glyphs.pixelCount(ch)).append(' ');
      }
    }
    boolean rejected = false;
    try {
      Glyphs.glyph('Q');
    } catch (IllegalArgumentException expected) {
      rejected = true;
    }
    check("wordmark glyphs rasterise to complete runs", ok && rejected, detail.toString());
  }

  private static void openingFramesKeepMoving() {
    OpeningRenderer renderer = new OpeningRenderer(OpeningLayout.build(OpeningLayout.DEFAULT_SEED));
    double[] times = {0, 2000, 6000, 14000};
    boolean moved = true;
    StringBuilder detail = new StringBuilder();
    for (int i = 1; i < times.length; i++) {
      double ratio = pixelDiff(renderer.frame(times[i - 1]), renderer.frame(times[i]));
      detail.append(String.format("%.1f%% ", ratio * 100));
      if (ratio < 0.003) moved = false;
    }
    check("opening frames differ over the intro", moved, "changed pixels: " + detail.toString().trim());
  }

  /** The title is drawn last, so every glyph pixel must land on the palette colour untouched. */
  private static void openingWordmarkIsPainted() {
    OpeningData scene = OpeningLayout.build(OpeningLayout.DEFAULT_SEED);
    int[] frame = new OpeningRenderer(scene).frame(4000);
    Color glyph = scene.palette().glyph();
    int expected = (glyph.r() << 16) | (glyph.g() << 8) | glyph.b();
    int total = 0;
    int matched = 0;
    for (OpeningData.Letter letter : scene.wordmark().letters()) {
      for (int[] run : letter.runs()) {
        for (int y = letter.y() + run[1]; y < letter.y() + run[1] + run[3]; y++) {
          for (int x = letter.x() + run[0]; x < letter.x() + run[0] + run[2]; x++) {
            total++;
            if (frame[y * scene.settings().width() + x] == expected) matched++;
          }
        }
      }
    }
    check("opening wordmark paints solid glyph pixels", total > 0 && matched == total, matched + "/" + total);
  }

  private static void openingGoldenFrameIsStable() {
    long actual = hash(new OpeningRenderer(OpeningLayout.build(OpeningLayout.DEFAULT_SEED)).frame(0));
    check(
        "opening golden frame at t=0 is unchanged",
        actual == OPENING_GOLDEN_T0,
        "expected " + OPENING_GOLDEN_T0 + " but rendered " + actual + " (update the constant if the art changed on purpose)");
  }

  /**
   * Locks the opening look. Unlike the hero this hashes colours, not the RGBA buffer, because the
   * opening renderer paints whole pixels and never leaves a transparent one behind.
   */
  private static final long OPENING_GOLDEN_T0 = -6777662908639799730L;

  private static OpeningData withGate(OpeningData scene, OpeningData.Gate gate) {
    return new OpeningData(
        scene.settings(),
        scene.palette(),
        scene.layers(),
        scene.stars(),
        gate,
        scene.path(),
        scene.embers(),
        scene.mist(),
        scene.wordmark());
  }

  private static double pixelDiff(int[] a, int[] b) {
    int changed = 0;
    for (int i = 0; i < a.length; i++) {
      if (a[i] != b[i]) changed++;
    }
    return changed / (double) a.length;
  }

  private static long hash(int[] pixels) {
    long value = 1125899906842597L;
    for (int pixel : pixels) {
      value = 31 * value + pixel;
    }
    return value;
  }

  private static double diffRatio(byte[] a, byte[] b) {
    int changed = 0;
    for (int i = 0; i < a.length; i += 4) {
      if (a[i] != b[i] || a[i + 1] != b[i + 1] || a[i + 2] != b[i + 2]) changed++;
    }
    return changed / (double) (a.length / 4);
  }

  private static long hash(byte[] data) {
    long value = 1125899906842597L;
    for (byte b : data) {
      value = 31 * value + (b & 0xFF);
    }
    return value;
  }

  private static byte[] bytes(int... values) {
    byte[] out = new byte[values.length];
    for (int i = 0; i < values.length; i++) out[i] = (byte) values[i];
    return out;
  }

  private static int readInt(byte[] data, int offset) {
    return ((data[offset] & 0xFF) << 24)
        | ((data[offset + 1] & 0xFF) << 16)
        | ((data[offset + 2] & 0xFF) << 8)
        | (data[offset + 3] & 0xFF);
  }

  private static void check(String name, boolean ok, String detail) {
    if (ok) {
      passed++;
      System.out.println("  ok   " + name);
    } else {
      failed++;
      System.out.println("  FAIL " + name + (detail == null || detail.isEmpty() ? "" : ": " + detail));
    }
  }
}
