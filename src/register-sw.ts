import { useEffect, useState } from 'react';

export type SWRegistrationStatus = 'idle' | 'registering' | 'registered' | 'unsupported' | 'error';

let currentStatus: SWRegistrationStatus = 'idle';
const listeners = new Set<(status: SWRegistrationStatus) => void>();

function notify(status: SWRegistrationStatus) {
  currentStatus = status;
  for (const fn of listeners) fn(status);
}

/**
 * Registers the root `/sw.js` pass-through Service Worker.
 * Guarded by `'serviceWorker' in navigator` and safe error handling so unsupported
 * or restricted environments never break rendering.
 */
export async function registerServiceWorker(): Promise<SWRegistrationStatus> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    notify('unsupported');
    return 'unsupported';
  }
  if (currentStatus === 'registered' || currentStatus === 'registering') {
    return currentStatus;
  }
  notify('registering');
  try {
    await navigator.serviceWorker.register('/sw.js', { scope: '/' });
    notify('registered');
    return 'registered';
  } catch {
    notify('error');
    return 'error';
  }
}

export function useServiceWorkerStatus(): SWRegistrationStatus {
  const [status, setStatus] = useState<SWRegistrationStatus>(currentStatus);
  useEffect(() => {
    listeners.add(setStatus);
    if (currentStatus === 'idle') {
      void registerServiceWorker();
    }
    return () => {
      listeners.delete(setStatus);
    };
  }, []);
  return status;
}

/**
 * Global declarative component that initiates `/sw.js` registration on mount,
 * matching the architecture documented in the Advance Roleplay Studio PWA report.
 */
export function RegisterSW() {
  useEffect(() => {
    void registerServiceWorker();
  }, []);
  return null;
}
