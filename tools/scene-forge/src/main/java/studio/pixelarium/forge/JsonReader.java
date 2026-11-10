package studio.pixelarium.forge;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
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
 * Reads scene JSON back into {@link SceneData}.
 *
 * <p>Two jobs: prove the generated file is valid JSON that contains what the validator expects (a
 * serialiser bug that emits a stray comma is otherwise only found by the browser), and let
 * {@code --check} compare the committed file against a fresh generation so a hand-edited or stale
 * {@code heroScene.json} cannot slip into a commit.</p>
 *
 * <p>Deliberately a small recursive-descent parser over the JSON grammar rather than a dependency:
 * objects, arrays, strings, numbers, booleans and null are all the schema needs.</p>
 */
public final class JsonReader {

  private final String source;
  private int index;

  private JsonReader(String source) {
    this.source = source;
  }

  public static SceneData read(String json) {
    JsonReader reader = new JsonReader(json);
    Object parsed = reader.parseValue();
    reader.skipWhitespace();
    if (reader.index != json.length()) {
      throw new SceneFormatException("trailing content at offset " + reader.index);
    }
    if (!(parsed instanceof Map<?, ?> root)) {
      throw new SceneFormatException("scene JSON must be an object");
    }
    return toScene(asMap(root, "root"));
  }

  public static Object parse(String json) {
    JsonReader reader = new JsonReader(json);
    return reader.parseValue();
  }

  /* ------------------------------------------------------------------ */
  /* Parsing                                                             */
  /* ------------------------------------------------------------------ */

  private Object parseValue() {
    skipWhitespace();
    if (index >= source.length()) throw new SceneFormatException("unexpected end of input");
    char c = source.charAt(index);
    return switch (c) {
      case '{' -> parseObject();
      case '[' -> parseArray();
      case '"' -> parseString();
      case 't' -> literal("true", Boolean.TRUE);
      case 'f' -> literal("false", Boolean.FALSE);
      case 'n' -> literal("null", null);
      default -> parseNumber();
    };
  }

  private Map<String, Object> parseObject() {
    expect('{');
    Map<String, Object> map = new LinkedHashMap<>();
    skipWhitespace();
    if (peek() == '}') {
      index++;
      return map;
    }
    while (true) {
      skipWhitespace();
      String key = parseString();
      skipWhitespace();
      expect(':');
      map.put(key, parseValue());
      skipWhitespace();
      char next = peek();
      if (next == ',') {
        index++;
        continue;
      }
      expect('}');
      return map;
    }
  }

  private List<Object> parseArray() {
    expect('[');
    List<Object> list = new ArrayList<>();
    skipWhitespace();
    if (peek() == ']') {
      index++;
      return list;
    }
    while (true) {
      list.add(parseValue());
      skipWhitespace();
      char next = peek();
      if (next == ',') {
        index++;
        continue;
      }
      expect(']');
      return list;
    }
  }

  private String parseString() {
    expect('"');
    StringBuilder text = new StringBuilder();
    while (index < source.length()) {
      char c = source.charAt(index++);
      if (c == '"') return text.toString();
      if (c != '\\') {
        text.append(c);
        continue;
      }
      if (index >= source.length()) break;
      char escape = source.charAt(index++);
      switch (escape) {
        case '"' -> text.append('"');
        case '\\' -> text.append('\\');
        case '/' -> text.append('/');
        case 'b' -> text.append('\b');
        case 'f' -> text.append('\f');
        case 'n' -> text.append('\n');
        case 'r' -> text.append('\r');
        case 't' -> text.append('\t');
        case 'u' -> {
          if (index + 4 > source.length()) throw new SceneFormatException("truncated unicode escape");
          text.append((char) Integer.parseInt(source.substring(index, index + 4), 16));
          index += 4;
        }
        default -> throw new SceneFormatException("invalid escape \\" + escape);
      }
    }
    throw new SceneFormatException("unterminated string");
  }

  private Object parseNumber() {
    int start = index;
    if (peek() == '-') index++;
    while (index < source.length() && "0123456789.eE+-".indexOf(source.charAt(index)) >= 0) {
      index++;
    }
    if (start == index) throw new SceneFormatException("invalid value at offset " + start);
    try {
      return Double.parseDouble(source.substring(start, index));
    } catch (NumberFormatException error) {
      throw new SceneFormatException("invalid number at offset " + start);
    }
  }

  private Object literal(String word, Object value) {
    if (!source.startsWith(word, index)) throw new SceneFormatException("invalid literal at offset " + index);
    index += word.length();
    return value;
  }

  private void expect(char c) {
    skipWhitespace();
    if (index >= source.length() || source.charAt(index) != c) {
      throw new SceneFormatException("expected '" + c + "' at offset " + index);
    }
    index++;
  }

  private char peek() {
    return index < source.length() ? source.charAt(index) : '\0';
  }

  private void skipWhitespace() {
    while (index < source.length() && Character.isWhitespace(source.charAt(index))) index++;
  }

  /* ------------------------------------------------------------------ */
  /* Mapping                                                             */
  /* ------------------------------------------------------------------ */

  private static SceneData toScene(Map<String, Object> root) {
    Map<String, Object> settings = asMap(root.get("settings"), "settings");
    Map<String, Object> palette = asMap(root.get("palette"), "palette");

    List<SkyStop> stops = new ArrayList<>();
    for (Object entry : asList(palette.get("skyStops"), "palette.skyStops")) {
      Map<String, Object> stop = asMap(entry, "palette.skyStops[]");
      stops.add(new SkyStop(asDouble(stop.get("at"), "at"), asColor(stop.get("color"), "color")));
    }

    Palette colours =
        new Palette(
            List.copyOf(stops),
            asColor(palette.get("sunCore"), "sunCore"),
            asColor(palette.get("sunMid"), "sunMid"),
            asColor(palette.get("sunOuter"), "sunOuter"),
            asColor(palette.get("sunHalo"), "sunHalo"),
            asColor(palette.get("moon"), "moon"),
            asColor(palette.get("moonHighlight"), "moonHighlight"),
            asColor(palette.get("moonHalo"), "moonHalo"),
            asColor(palette.get("starWarm"), "starWarm"),
            asColor(palette.get("starCool"), "starCool"),
            asColor(palette.get("reflectionNear"), "reflectionNear"),
            asColor(palette.get("reflectionFar"), "reflectionFar"),
            asColor(palette.get("firefly"), "firefly"),
            asColor(palette.get("bird"), "bird"),
            asColor(palette.get("waterTop"), "waterTop"),
            asColor(palette.get("waterBottom"), "waterBottom"),
            asColor(palette.get("waterSheen"), "waterSheen"));

    List<Star> stars = new ArrayList<>();
    for (Object entry : asList(root.get("stars"), "stars")) {
      Map<String, Object> star = asMap(entry, "stars[]");
      stars.add(
          new Star(
              (int) asDouble(star.get("x"), "stars.x"),
              (int) asDouble(star.get("y"), "stars.y"),
              asDouble(star.get("phase"), "stars.phase"),
              Boolean.TRUE.equals(star.get("warm"))));
    }

    List<CloudBand> bands = new ArrayList<>();
    for (Object entry : asList(root.get("cloudBands"), "cloudBands")) {
      Map<String, Object> band = asMap(entry, "cloudBands[]");
      List<Cloud> clouds = new ArrayList<>();
      for (Object cloudEntry : asList(band.get("clouds"), "cloudBands.clouds")) {
        Map<String, Object> cloud = asMap(cloudEntry, "cloudBands.clouds[]");
        clouds.add(
            new Cloud(
                asDouble(cloud.get("x"), "cloud.x"),
                asDouble(cloud.get("y"), "cloud.y"),
                asDouble(cloud.get("rx"), "cloud.rx"),
                asDouble(cloud.get("ry"), "cloud.ry"),
                asDouble(cloud.get("speed"), "cloud.speed")));
      }
      bands.add(
          new CloudBand(
              String.valueOf(band.get("name")),
              asDouble(band.get("yFrom"), "cloudBands.yFrom"),
              asDouble(band.get("yTo"), "cloudBands.yTo"),
              (int) asDouble(band.get("count"), "cloudBands.count"),
              asDouble(band.get("speed"), "cloudBands.speed"),
              asColor(band.get("color"), "cloudBands.color"),
              asColor(band.get("topColor"), "cloudBands.topColor"),
              asDouble(band.get("alpha"), "cloudBands.alpha"),
              Boolean.TRUE.equals(band.get("behindRidges")),
              List.copyOf(clouds)));
    }

    List<Firefly> fireflies = new ArrayList<>();
    for (Object entry : asList(root.get("fireflies"), "fireflies")) {
      Map<String, Object> fly = asMap(entry, "fireflies[]");
      fireflies.add(
          new Firefly(
              asDouble(fly.get("x"), "fireflies.x"),
              asDouble(fly.get("y"), "fireflies.y"),
              asDouble(fly.get("phase"), "fireflies.phase"),
              asDouble(fly.get("speed"), "fireflies.speed")));
    }

    List<Bird> birds = new ArrayList<>();
    for (Object entry : asList(root.get("birds"), "birds")) {
      Map<String, Object> bird = asMap(entry, "birds[]");
      birds.add(
          new Bird(
              asDouble(bird.get("start"), "birds.start"),
              asDouble(bird.get("y"), "birds.y"),
              asDouble(bird.get("speed"), "birds.speed"),
              asDouble(bird.get("phase"), "birds.phase")));
    }

    return new SceneData(
        new Settings(
            (int) asDouble(settings.get("width"), "settings.width"),
            (int) asDouble(settings.get("height"), "settings.height"),
            (int) asDouble(settings.get("horizon"), "settings.horizon"),
            (int) asDouble(settings.get("seed"), "settings.seed"),
            (int) asDouble(settings.get("fps"), "settings.fps")),
        colours,
        toRidge(asMap(root.get("farRidge"), "farRidge"), "farRidge"),
        toRidge(asMap(root.get("nearRidge"), "nearRidge"), "nearRidge"),
        List.copyOf(stars),
        List.copyOf(bands),
        List.copyOf(fireflies),
        List.copyOf(birds));
  }

  private static Ridge toRidge(Map<String, Object> ridge, String label) {
    List<Peak> peaks = new ArrayList<>();
    for (Object entry : asList(ridge.get("peaks"), label + ".peaks")) {
      Map<String, Object> peak = asMap(entry, label + ".peaks[]");
      peaks.add(
          new Peak(
              asDouble(peak.get("x"), "peak.x"),
              asDouble(peak.get("height"), "peak.height"),
              asDouble(peak.get("spread"), "peak.spread")));
    }
    return new Ridge(
        String.valueOf(ridge.get("name")),
        asDouble(ridge.get("baseY"), label + ".baseY"),
        asColor(ridge.get("body"), label + ".body"),
        asColor(ridge.get("shade"), label + ".shade"),
        asColor(ridge.get("rim"), label + ".rim"),
        List.copyOf(peaks));
  }

  private static Color asColor(Object value, String label) {
    List<Object> parts = asList(value, label);
    if (parts.size() != 3) throw new SceneFormatException(label + ": expected three channels");
    return new Color(
        (int) asDouble(parts.get(0), label + ".r"),
        (int) asDouble(parts.get(1), label + ".g"),
        (int) asDouble(parts.get(2), label + ".b"));
  }

  private static double asDouble(Object value, String label) {
    if (value instanceof Double number) return number;
    throw new SceneFormatException(label + ": expected a number");
  }

  private static Map<String, Object> asMap(Object value, String label) {
    if (value instanceof Map<?, ?> map) {
      Map<String, Object> typed = new LinkedHashMap<>();
      map.forEach((key, item) -> typed.put(String.valueOf(key), item));
      return typed;
    }
    throw new SceneFormatException(label + ": expected an object");
  }

  private static List<Object> asList(Object value, String label) {
    if (value instanceof List<?> list) return List.copyOf(list);
    throw new SceneFormatException(label + ": expected an array");
  }

  /** Thrown when the JSON does not match the scene schema. */
  public static final class SceneFormatException extends RuntimeException {
    private static final long serialVersionUID = 1L;

    public SceneFormatException(String message) {
      super(message);
    }
  }
}
