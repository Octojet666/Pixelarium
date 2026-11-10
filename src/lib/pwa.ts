/** Install prompt plumbing: Pixelarium runs in the browser and as an installed app. */

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

export interface InstallState {
  canInstall: boolean;
  installed: boolean;
  standalone: boolean;
  online: boolean;
}

let deferredPrompt: BeforeInstallPromptEvent | null = null;
let installed = false;
const listeners = new Set<() => void>();

function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  const display = window.matchMedia?.('(display-mode: standalone)').matches ?? false;
  const nav = navigator as Navigator & { standalone?: boolean };
  return display || window.matchMedia?.('(display-mode: window-controls-overlay)').matches === true || nav.standalone === true;
}

function snapshot(): InstallState {
  return {
    canInstall: deferredPrompt !== null && !installed && !isStandalone(),
    installed: installed || isStandalone(),
    standalone: isStandalone(),
    online: typeof navigator === 'undefined' ? true : navigator.onLine,
  };
}

let current = snapshot();

function emit(): void {
  current = snapshot();
  for (const listener of listeners) listener();
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferredPrompt = event as BeforeInstallPromptEvent;
    emit();
  });
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    installed = true;
    emit();
  });
  window.addEventListener('online', emit);
  window.addEventListener('offline', emit);
  window.matchMedia?.('(display-mode: standalone)').addEventListener?.('change', emit);
}

export function subscribeInstall(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getInstallState(): InstallState {
  return current;
}

export type InstallResult = 'accepted' | 'dismissed' | 'unavailable';

export async function installApp(): Promise<InstallResult> {
  if (!deferredPrompt) return 'unavailable';
  const prompt = deferredPrompt;
  await prompt.prompt();
  const choice = await prompt.userChoice;
  deferredPrompt = null;
  emit();
  return choice.outcome;
}

/** Registers the offline app shell in production builds only. */
export function registerServiceWorker(): void {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js')
      .then((registration) => {
        registration.addEventListener('updatefound', () => {
          const worker = registration.installing;
          worker?.addEventListener('statechange', () => {
            if (worker.state === 'installed' && navigator.serviceWorker.controller) {
              worker.postMessage('skip-waiting');
            }
          });
        });
      })
      .catch((error) => {
        console.warn('[pixelarium] Service worker registration failed:', error);
      });
  });
}
