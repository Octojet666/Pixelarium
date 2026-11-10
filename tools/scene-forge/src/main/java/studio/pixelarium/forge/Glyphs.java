package studio.pixelarium.forge;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import studio.pixelarium.forge.OpeningData.Letter;
import studio.pixelarium.forge.OpeningData.Wordmark;

/**
 * A 5x7 pixel font for the opening wordmark.
 *
 * <p>Only the letters the title needs are defined, and undefined characters are an error rather than
 * a blank: a typo in the title should fail the build, not ship an invisible letter. Each glyph is
 * converted to merged horizontal runs at generation time, which keeps the JSON small and lets the
 * browser draw the title with plain rectangles — no font file, no text metrics, and identical
 * lettering in the offline preview.</p>
 */
final class Glyphs {

  static final int WIDTH = 5;
  static final int HEIGHT = 7;

  private static final Map<Character, String[]> FONT = new LinkedHashMap<>();

  static {
    FONT.put('A', new String[] {
        "01110",
        "10001",
        "10001",
        "11111",
        "10001",
        "10001",
        "10001"});
    FONT.put('E', new String[] {
        "11111",
        "10000",
        "10000",
        "11110",
        "10000",
        "10000",
        "11111"});
    FONT.put('I', new String[] {
        "11111",
        "00100",
        "00100",
        "00100",
        "00100",
        "00100",
        "11111"});
    FONT.put('L', new String[] {
        "10000",
        "10000",
        "10000",
        "10000",
        "10000",
        "10000",
        "11111"});
    FONT.put('M', new String[] {
        "10001",
        "11011",
        "10101",
        "10101",
        "10001",
        "10001",
        "10001"});
    FONT.put('P', new String[] {
        "11110",
        "10001",
        "10001",
        "11110",
        "10000",
        "10000",
        "10000"});
    FONT.put('R', new String[] {
        "11110",
        "10001",
        "10001",
        "11110",
        "10100",
        "10010",
        "10001"});
    FONT.put('U', new String[] {
        "10001",
        "10001",
        "10001",
        "10001",
        "10001",
        "10001",
        "01110"});
    FONT.put('X', new String[] {
        "10001",
        "10001",
        "01010",
        "00100",
        "01010",
        "10001",
        "10001"});
  }

  private Glyphs() {}

  /** Rows of a glyph, top-down, as '0'/'1' strings. Throws for characters the font does not have. */
  static String[] glyph(char ch) {
    String[] rows = FONT.get(Character.toUpperCase(ch));
    if (rows == null) {
      throw new IllegalArgumentException("No glyph for '" + ch + "' (font has: " + FONT.keySet() + ")");
    }
    return rows;
  }

  /** Pixel spans of one glyph, {x, y, w, h}, relative to the glyph's top-left corner. */
  static int[][] runs(char ch) {
    String[] rows = glyph(ch);
    List<int[]> spans = new ArrayList<>();
    for (int y = 0; y < HEIGHT; y++) {
      String row = rows[y];
      if (row.length() != WIDTH) {
        throw new IllegalStateException("Glyph '" + ch + "' row " + y + " is " + row.length() + " wide, expected " + WIDTH);
      }
      int x = 0;
      while (x < WIDTH) {
        if (row.charAt(x) == '0') {
          x++;
          continue;
        }
        int start = x;
        while (x < WIDTH && row.charAt(x) == '1') {
          x++;
        }
        spans.add(new int[] {start, y, x - start, 1});
      }
    }
    int[][] out = new int[spans.size()][];
    for (int i = 0; i < spans.size(); i++) {
      out[i] = spans.get(i);
    }
    return out;
  }

  /** Total pixels a glyph lights up; used by the tests to prove the rasteriser is complete. */
  static int pixelCount(char ch) {
    int count = 0;
    for (String row : glyph(ch)) {
      for (int i = 0; i < row.length(); i++) {
        if (row.charAt(i) == '1') count++;
      }
    }
    return count;
  }

  /**
   * Positions the letters left to right at {@code (x, y)}. Ascenders are not needed here: the wordmark
   * is uppercase by design, and a fixed 5x7 cell keeps the reveal animation a simple left-to-right
   * sweep.
   */
  static Wordmark layout(String text, int x, int y, int gap) {
    List<Letter> letters = new ArrayList<>(text.length());
    int cursor = x;
    for (int i = 0; i < text.length(); i++) {
      char ch = text.charAt(i);
      letters.add(new Letter(ch, cursor, y, runs(ch)));
      cursor += WIDTH + gap;
    }
    return new Wordmark(text, x, y, WIDTH, HEIGHT, gap, List.copyOf(letters));
  }

  /** Width in pixels of a laid-out wordmark, gaps between letters included but no trailing gap. */
  static int width(String text, int gap) {
    if (text.isEmpty()) return 0;
    return text.length() * WIDTH + (text.length() - 1) * gap;
  }
}
