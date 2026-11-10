package studio.pixelarium.forge;

/**
 * Deterministic 32-bit PRNG that mirrors the mulberry32 generator the web app uses.
 *
 * <p>Keeping the algorithm identical means the Java generator and the TypeScript code that used to
 * build the hero scene by hand produce the same layout, so moving ownership of that data here is a
 * pure refactor rather than a re-roll of the art direction.</p>
 */
public final class Rng {

  private int state;

  public Rng(int seed) {
    this.state = seed;
  }

  /** Next value in [0, 1), bit-for-bit the same stream as the JavaScript implementation. */
  public double next() {
    state += 0x6D2B79F5;
    int t = (state ^ (state >>> 15)) * (1 | state);
    t = (t + (t ^ (t >>> 7)) * (61 | t)) ^ t;
    return Integer.toUnsignedLong(t ^ (t >>> 14)) / 4294967296.0;
  }

  public int intBelow(int bound) {
    return (int) Math.floor(next() * bound);
  }

  public double between(double min, double max) {
    return min + next() * (max - min);
  }
}
