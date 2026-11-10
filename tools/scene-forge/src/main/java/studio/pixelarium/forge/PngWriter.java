package studio.pixelarium.forge;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.util.zip.CRC32;
import java.util.zip.Deflater;

/**
 * Minimal PNG encoder for RGBA8 images.
 *
 * <p>Only what the preview needs: one colour type, one filter strategy, no metadata. Writing it by hand
 * keeps the tool dependency-free (no ImageIO surprises across JDK builds) and the format is small enough
 * that the implementation stays auditable.</p>
 */
public final class PngWriter {

  private static final byte[] SIGNATURE = {(byte) 0x89, 'P', 'N', 'G', '\r', '\n', 0x1A, '\n'};

  private PngWriter() {}

  /**
   * Encodes an RGBA buffer.
   *
   * @param rgba pixel data, four bytes per pixel, row-major, top row first
   * @param width image width in pixels
   * @param height image height in pixels
   * @param scale integer nearest-neighbour magnification applied while writing
   */
  public static byte[] encode(byte[] rgba, int width, int height, int scale) throws IOException {
    ByteArrayOutputStream raw = new ByteArrayOutputStream((width * scale * 4 + 1) * height * scale);
    for (int y = 0; y < height; y++) {
      for (int repeat = 0; repeat < scale; repeat++) {
        raw.write(0); // filter type 0 (None) for each scanline
        for (int x = 0; x < width; x++) {
          int base = (y * width + x) * 4;
          for (int s = 0; s < scale; s++) {
            raw.write(rgba[base] & 0xFF);
            raw.write(rgba[base + 1] & 0xFF);
            raw.write(rgba[base + 2] & 0xFF);
            raw.write(rgba[base + 3] & 0xFF);
          }
        }
      }
    }

    ByteArrayOutputStream png = new ByteArrayOutputStream(64 * 1024);
    png.write(SIGNATURE);

    ByteArrayOutputStream header = new ByteArrayOutputStream(13);
    writeInt(header, width * scale);
    writeInt(header, height * scale);
    header.write(8); // bit depth
    header.write(6); // colour type RGBA
    header.write(0); // deflate
    header.write(0); // adaptive filtering
    header.write(0); // no interlace
    writeChunk(png, "IHDR", header.toByteArray());
    writeChunk(png, "IDAT", deflate(raw.toByteArray()));
    writeChunk(png, "IEND", new byte[0]);
    return png.toByteArray();
  }

  private static byte[] deflate(byte[] data) {
    Deflater deflater = new Deflater(Deflater.BEST_COMPRESSION);
    try {
      deflater.setInput(data);
      deflater.finish();
      ByteArrayOutputStream out = new ByteArrayOutputStream(data.length / 4 + 64);
      byte[] buffer = new byte[16 * 1024];
      while (!deflater.finished()) {
        int written = deflater.deflate(buffer);
        out.write(buffer, 0, written);
      }
      return out.toByteArray();
    } finally {
      deflater.end();
    }
  }

  private static void writeChunk(ByteArrayOutputStream out, String type, byte[] data) {
    writeInt(out, data.length);
    byte[] typeBytes = type.getBytes(java.nio.charset.StandardCharsets.US_ASCII);
    out.write(typeBytes, 0, typeBytes.length);
    out.write(data, 0, data.length);
    CRC32 crc = new CRC32();
    crc.update(typeBytes);
    crc.update(data);
    writeInt(out, (int) crc.getValue());
  }

  private static void writeInt(ByteArrayOutputStream out, int value) {
    out.write((value >>> 24) & 0xFF);
    out.write((value >>> 16) & 0xFF);
    out.write((value >>> 8) & 0xFF);
    out.write(value & 0xFF);
  }
}
