package studio.pixelarium.forge;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Command-line entry point for the Pixelarium scene forge.
 *
 * <pre>
 *   --out &lt;file&gt;      where to write the scene JSON   (default: src/data/heroScene.json)
 *   --png &lt;file&gt;      where to write a preview strip   (only with --frames or --all)
 *   --frames a,b,c    frame timestamps in milliseconds
 *   --seed &lt;int&gt;      scene seed (defaults to the committed one)
 *   --validate        run the data checks and print the report
 *   --all             JSON + preview strip + validation
 *   --opening         the same, for the opening title scene
 *   --opening-check   fail if src/data/openingScene.json is stale
 * </pre>
 *
 * <p>The generated JSON is committed, so neither the app build nor an ordinary checkout needs a JDK;
 * Java is only required when the scene data itself changes.</p>
 */
public final class Main {

  private static final String DEFAULT_OUT = "src/data/heroScene.json";
  private static final String DEFAULT_PNG = "tools/scene-forge/out/hero-strip.png";
  private static final double[] DEFAULT_FRAMES = {0, 2000, 6000, 12000, 24000, 48000};

  private static final String DEFAULT_OPENING_OUT = "src/data/openingScene.json";
  private static final String DEFAULT_OPENING_PNG = "tools/scene-forge/out/opening-strip.png";
  /** One frame per beat of the intro: settle, embers, drift. */
  private static final double[] DEFAULT_OPENING_FRAMES = {0, 3000, 7000, 12000, 18000};

  private Main() {}

  public static void main(String[] args) {
    Map<String, String> options = parse(args);

    if (options.containsKey("help")) {
      System.out.println(usage());
      return;
    }

    if (options.containsKey("self-test")) {
      System.exit(SelfTest.run());
    }

    if (options.containsKey("opening") || options.containsKey("opening-check") || options.containsKey("opening-png")) {
      int openingSeed =
          options.containsKey("seed") ? Integer.parseInt(options.get("seed")) : OpeningLayout.DEFAULT_SEED;
      System.exit(runOpening(options, openingSeed));
    }

    int seed = options.containsKey("seed") ? Integer.parseInt(options.get("seed")) : SceneLayout.DEFAULT_SEED;
    SceneData scene = SceneLayout.build(seed);

    List<String> problems = SceneValidator.validate(scene);
    if (!problems.isEmpty()) {
      System.err.println("Scene data is invalid (" + problems.size() + " problem(s)):");
      for (String problem : problems) {
        System.err.println("  - " + problem);
      }
      System.exit(1);
    }

    if (options.containsKey("check")) {
      System.exit(checkCommitted(sceneJson(seed), options));
    }

    boolean all = options.containsKey("all");
    boolean validateOnly = options.containsKey("validate") && !all;
    boolean wantsJson = all || options.containsKey("out");
    boolean wantsPng = all || options.containsKey("png") || options.containsKey("frames");

    if (!validateOnly && !wantsJson && !wantsPng) {
      System.out.println(usage());
      return;
    }

    System.out.println("scene-forge: seed=" + seed + " " + scene.settings().width() + "x" + scene.settings().height()
        + " horizon=" + scene.settings().horizon() + " fps=" + scene.settings().fps());

    if (validateOnly || all || options.containsKey("validate")) {
      System.out.println("  validation: ok (" + problems.size() + " problems)");
    }
    System.out.println("  stars=" + scene.stars().size()
        + " clouds=" + scene.cloudBands().stream().mapToInt(band -> band.clouds().size()).sum()
        + " fireflies=" + scene.fireflies().size()
        + " birds=" + scene.birds().size());

    if (wantsJson) {
      Path out = Path.of(options.getOrDefault("out", DEFAULT_OUT));
      write(out, JsonWriter.toJson(scene).getBytes(StandardCharsets.UTF_8));
      System.out.println("  json: " + out);
    }

    if (wantsPng) {
      Path png = Path.of(options.getOrDefault("png", DEFAULT_PNG));
      double[] frames = options.containsKey("frames") ? parseFrames(options.get("frames")) : DEFAULT_FRAMES;
      FrameRenderer renderer = new FrameRenderer(scene);
      byte[] strip = renderer.renderStrip(frames, 4);
      try {
        int stripWidth = renderer.stripWidth(frames.length, 4);
        write(png, PngWriter.encode(strip, stripWidth, renderer.height(), 6));
      } catch (IOException error) {
        System.err.println("Failed to encode preview: " + error.getMessage());
        System.exit(1);
      }
      System.out.println("  preview: " + png + " (" + frames.length + " frames)");
    }
  }

  /**
   * Fails when the committed JSON no longer matches a fresh generation, so a hand-edited or stale
   * scene file cannot reach a commit unnoticed.
   */
  private static int checkCommitted(String expected, Map<String, String> options) {
    String raw = options.get("check");
    Path target = Path.of(raw != null && !raw.equals("true") ? raw : DEFAULT_OUT);
    return checkText(expected, target, "--all");
  }

  /** Shared drift guard: compares a generated document with the committed copy on disk. */
  private static int checkText(String expected, Path target, String regenerate) {
    if (!Files.exists(target)) {
      System.err.println("check: " + target + " does not exist; run " + regenerate + " first");
      return 1;
    }
    String actual;
    try {
      actual = Files.readString(target, StandardCharsets.UTF_8);
    } catch (IOException error) {
      System.err.println("check: cannot read " + target + ": " + error.getMessage());
      return 1;
    }
    if (actual.equals(expected)) {
      System.out.println("check: " + target + " is up to date");
      return 0;
    }

    String[] expectedLines = expected.split("\\R");
    String[] actualLines = actual.split("\\R");
    for (int i = 0; i < Math.max(expectedLines.length, actualLines.length); i++) {
      String want = i < expectedLines.length ? expectedLines[i] : "<missing>";
      String got = i < actualLines.length ? actualLines[i] : "<missing>";
      if (!want.equals(got)) {
        System.err.println("check: " + target + " is stale, first difference on line " + (i + 1));
        System.err.println("  expected: " + want);
        System.err.println("  found:    " + got);
        break;
      }
    }
    System.err.println("check: run `bash tools/scene-forge/run.sh " + regenerate + "` and commit the result");
    return 1;
  }

  private static String sceneJson(int seed) {
    return JsonWriter.toJson(SceneLayout.build(seed));
  }

  /** The opening title scene: same flow as the hero, different data and defaults. */
  private static int runOpening(Map<String, String> options, int seed) {
    OpeningData scene = OpeningLayout.build(seed);
    List<String> problems = OpeningValidator.validate(scene);
    if (!problems.isEmpty()) {
      System.err.println("Opening scene data is invalid (" + problems.size() + " problem(s)):");
      for (String problem : problems) {
        System.err.println("  - " + problem);
      }
      return 1;
    }

    String json = OpeningJson.toJson(scene);
    if (options.containsKey("opening-check")) {
      String raw = options.get("opening-check");
      Path target = Path.of(raw != null && !raw.equals("true") ? raw : DEFAULT_OPENING_OUT);
      return checkText(json, target, "--opening");
    }

    System.out.println("scene-forge opening: seed=" + seed + " " + scene.settings().width() + "x"
        + scene.settings().height() + " horizon=" + scene.settings().horizon()
        + " fps=" + scene.settings().fps());
    System.out.println("  validation: ok (" + problems.size() + " problems)");
    System.out.println("  stars=" + scene.stars().size()
        + " embers=" + scene.embers().size()
        + " mist=" + scene.mist().size()
        + " letters=" + scene.wordmark().letters().size());

    Path out = Path.of(options.getOrDefault("opening-out", DEFAULT_OPENING_OUT));
    if (options.containsKey("opening") || options.containsKey("opening-out")) {
      write(out, json.getBytes(StandardCharsets.UTF_8));
      System.out.println("  json: " + out);
    }

    if (options.containsKey("opening") || options.containsKey("opening-png")) {
      Path png = Path.of(options.getOrDefault("opening-png", DEFAULT_OPENING_PNG));
      double[] frames = options.containsKey("frames") ? parseFrames(options.get("frames")) : DEFAULT_OPENING_FRAMES;
      OpeningRenderer renderer = new OpeningRenderer(scene);
      byte[] strip = renderer.renderStrip(frames, 3);
      try {
        write(png, PngWriter.encode(strip, renderer.stripWidth(frames.length, 3), renderer.height(), 4));
      } catch (IOException error) {
        System.err.println("Failed to encode opening preview: " + error.getMessage());
        return 1;
      }
      System.out.println("  preview: " + png + " (" + frames.length + " frames)");
    }
    return 0;
  }

  private static double[] parseFrames(String raw) {
    String[] parts = raw.split(",");
    List<Double> values = new ArrayList<>(parts.length);
    for (String part : parts) {
      String trimmed = part.trim();
      if (!trimmed.isEmpty()) {
        values.add(Double.parseDouble(trimmed));
      }
    }
    double[] frames = new double[values.size()];
    for (int i = 0; i < frames.length; i++) {
      frames[i] = values.get(i);
    }
    return frames;
  }

  private static void write(Path path, byte[] bytes) {
    try {
      Path parent = path.toAbsolutePath().getParent();
      if (parent != null) {
        Files.createDirectories(parent);
      }
      Files.write(path, bytes);
    } catch (IOException error) {
      System.err.println("Failed to write " + path + ": " + error.getMessage());
      System.exit(1);
    }
  }

  private static Map<String, String> parse(String[] args) {
    Map<String, String> options = new LinkedHashMap<>();
    for (int i = 0; i < args.length; i++) {
      String arg = args[i];
      if (!arg.startsWith("--")) {
        System.err.println("Unexpected argument: " + arg);
        System.err.println(usage());
        System.exit(2);
      }
      String name = arg.substring(2);
      int equals = name.indexOf('=');
      if (equals > 0) {
        options.put(name.substring(0, equals), name.substring(equals + 1));
        continue;
      }
      boolean takesValue =
          List.of("out", "png", "frames", "seed", "opening-out", "opening-png").contains(name);
      if (takesValue && i + 1 < args.length && !args[i + 1].startsWith("--")) {
        options.put(name, args[++i]);
      } else {
        options.put(name, "true");
      }
    }
    return options;
  }

  private static String usage() {
    return String.join(
        System.lineSeparator(),
        "scene-forge - generates the Pixelarium scene data (hero + opening) and offline previews",
        "",
        "  --out <file>     write scene JSON (default " + DEFAULT_OUT + ")",
        "  --png <file>     write a frame strip PNG (default " + DEFAULT_PNG + ")",
        "  --frames a,b,c   frame timestamps in ms (default 0,2000,6000,12000,24000,48000)",
        "  --seed <int>     scene seed (default " + SceneLayout.DEFAULT_SEED + ")",
        "  --validate       verify the data and exit",
        "  --check [file]   fail if the committed JSON is stale (default " + DEFAULT_OUT + ")",
        "  --self-test      run the tool's own test suite",
        "  --all            JSON + preview + validation",
        "  --opening        regenerate the opening title scene JSON + preview",
        "  --opening-out <file>  where to write the opening JSON",
        "  --opening-png <file>  where to write the opening preview strip",
        "  --opening-check [file]  fail if the committed opening JSON is stale",
        "  --help           show this message");
  }
}
