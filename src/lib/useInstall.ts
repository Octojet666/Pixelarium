import { useSyncExternalStore } from 'react';
import { getInstallState, subscribeInstall, type InstallState } from './pwa';

export function useInstallState(): InstallState {
  return useSyncExternalStore(subscribeInstall, getInstallState, getInstallState);
}
