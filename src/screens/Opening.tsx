import { useCallback, useEffect, useRef, useState } from 'react';
import { OpeningScene } from '../components/OpeningScene';
import { markOpeningSeen } from '../lib/opening';
import { useUi } from '../store/ui';

/**
 * The game-style opening: the Ember Gate scene, the wordmark arriving letter by letter, then a
 * "press start" prompt. It plays once on a first visit, can be skipped with Escape or any click, and
 * is available again from the home page.
 *
 * Everything here is presentation timing. The picture itself is data from the Java scene tool.
 */

const REVEAL_START_MS = 750;
const REVEAL_END_MS = 3400;
const PROMPT_AT_MS = 3400;
const LEAVE_MS = 260;

export function Opening() {
  const open = useUi((s) => s.openingOpen);
  if (!open) return null;
  return <OpeningOverlay />;
}

function OpeningOverlay() {
  const setOpeningOpen = useUi((s) => s.setOpeningOpen);
  const openDialog = useUi((s) => s.openDialog);

  const reduce = typeof window !== 'undefined'
    && (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false);

  const [reveal, setReveal] = useState(reduce ? 1 : 0);
  const [ready, setReady] = useState(reduce);
  const [leaving, setLeaving] = useState(false);
  const startRef = useRef<HTMLButtonElement | null>(null);
  const closing = useRef(false);

  /**
   * Letter reveal, driven by timers rather than animation frames.
   *
   * The canvas paints with rAF, which browsers stop in a hidden tab; the intro itself must keep
   * advancing, or opening Pixelarium in a background tab would land the user on a stuck title screen
   * with a disabled prompt. Timers are throttled there but still run, and the reveal is only ~40
   * updates, so none of it needs frame precision.
   */
  useEffect(() => {
    if (reduce) {
      setReveal(1);
      setReady(true);
      return;
    }
    const start = performance.now();
    let timer = 0;
    const tick = () => {
      const elapsed = performance.now() - start;
      const progress = Math.min(1, Math.max(0, (elapsed - REVEAL_START_MS) / (REVEAL_END_MS - REVEAL_START_MS)));
      setReveal(progress);
      if (elapsed >= PROMPT_AT_MS) setReady(true);
      if (progress < 1 || elapsed < PROMPT_AT_MS) timer = window.setTimeout(tick, 90);
    };
    timer = window.setTimeout(tick, 90);
    return () => window.clearTimeout(timer);
  }, [reduce]);

  useEffect(() => {
    if (ready) startRef.current?.focus();
  }, [ready]);

  const enter = useCallback(() => {
    if (closing.current) return;
    closing.current = true;
    markOpeningSeen();
    setLeaving(true);
    window.setTimeout(() => {
      setOpeningOpen(false);
      // A first visit has both an intro and the onboarding tour; the intro goes first.
      let onboarded = false;
      try {
        onboarded = localStorage.getItem('pixelarium.onboarded') === '1';
      } catch {
        onboarded = true;
      }
      if (!onboarded) openDialog('onboarding');
    }, LEAVE_MS);
  }, [setOpeningOpen, openDialog]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      // Any key starts the studio; keys are not forwarded while the intro is up.
      event.preventDefault();
      event.stopPropagation();
      enter();
    };
    window.addEventListener('keydown', onKey, { capture: true });
    return () => window.removeEventListener('keydown', onKey, { capture: true });
  }, [enter]);

  return (
    <div
      className={`opening${leaving ? ' leaving' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-label="Pixelarium opening scene"
    >
      <div className="opening-stage" onClick={enter}>
        <OpeningScene reveal={reveal} />
        <div className="opening-copy">
          <p className="opening-tagline">Every pixel has a story.</p>
          <button
            ref={startRef}
            type="button"
            className={`opening-start${ready ? ' ready' : ''}`}
            onClick={(event) => {
              event.stopPropagation();
              enter();
            }}
            disabled={!ready}
          >
            Press start
          </button>
        </div>
      </div>
      <button type="button" className="opening-skip" onClick={enter}>
        Skip intro
      </button>
      <span className="opening-hint">Click or press any key</span>
    </div>
  );
}
