import { useEffect, useRef } from 'react';

/**
 * One back control per page. A page header's "<" (and the phone's back button) steps back one level:
 * an opened list row, an edit screen, an order's detail. Whatever is open registers a step here; the
 * newest one wins. With nothing registered the header leaves the page.
 */
const steps: { current: () => void }[] = [];

/** Runs the newest registered step. Returns false when there is none, so the caller leaves the page. */
export function runBackStep(): boolean {
  const last = steps[steps.length - 1];
  if (!last) return false;
  last.current();
  return true;
}

/** While `active`, the header "<" and the phone's back button call `onBack` instead of leaving the page. */
export function useBackStep(onBack: () => void, active = true) {
  const ref = useRef(onBack);
  ref.current = onBack;
  useEffect(() => {
    if (!active) return undefined;
    const entry = { current: () => ref.current() };
    steps.push(entry);
    return () => {
      const i = steps.indexOf(entry);
      if (i >= 0) steps.splice(i, 1);
    };
  }, [active]);
}
