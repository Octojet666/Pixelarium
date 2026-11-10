import { describe, expect, it } from 'vitest';
import { heroFrame } from './HeroScene';

const W = 64;
const H = 64;

function diffRatio(a: Uint8ClampedArray, b: Uint8ClampedArray): number {
  let changed = 0;
  for (let i = 0; i < a.length; i += 4) {
    if (a[i] !== b[i] || a[i + 1] !== b[i + 1] || a[i + 2] !== b[i + 2]) changed++;
  }
  return changed / (W * H);
}

describe('hero scene', () => {
  it('renders a full opaque frame at the document size', () => {
    const frame = heroFrame(0);
    expect(frame.length).toBe(W * H * 4);
    for (let i = 3; i < frame.length; i += 4) expect(frame[i]).toBe(255);
  });

  it('actually animates: frames a second apart differ in several places', () => {
    const a = heroFrame(1000);
    const b = heroFrame(2000);
    expect(diffRatio(a, b)).toBeGreaterThan(0.01);
  });

  it('keeps moving over the long cycle instead of freezing or snapping', () => {
    const samples = [0, 4000, 8000, 16000, 32000, 48000].map((t) => heroFrame(t));
    for (let i = 1; i < samples.length; i++) {
      expect(diffRatio(samples[i - 1], samples[i])).toBeGreaterThan(0.004);
    }
  });
});
