import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';

/**
 * Runs onForeground each time the app comes back to the screen from the
 * background (another app, the lock screen). Not on first launch.
 */
export function useAppForeground(onForeground: () => void): void {
  const latest = useRef(onForeground);
  latest.current = onForeground;
  useEffect(() => {
    let last: string | null | undefined = AppState.currentState;
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active' && last !== 'active') latest.current();
      last = next;
    });
    return () => sub.remove();
  }, []);
}
