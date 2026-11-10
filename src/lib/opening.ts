/**
 * Whether the opening scene has already played.
 *
 * Kept out of the React component so hot reloading the intro does not reset state, and so the app
 * shell can ask the question without mounting the overlay.
 */

export const OPENING_SEEN_KEY = 'pixelarium.openingSeen';

export function hasSeenOpening(): boolean {
  try {
    return localStorage.getItem(OPENING_SEEN_KEY) === '1';
  } catch {
    return false;
  }
}

export function markOpeningSeen(): void {
  try {
    localStorage.setItem(OPENING_SEEN_KEY, '1');
  } catch {
    /* private mode or storage disabled: the intro simply plays again next time */
  }
}
