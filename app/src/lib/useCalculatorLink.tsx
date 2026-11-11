import { createContext, ReactNode, useCallback, useContext, useMemo, useState } from 'react';
import { Job, OpenJobRequest } from './jobs';

interface CalculatorLinkApi {
  /** The last saved job asked to open in the calculator; a new nonce each time. */
  openJob?: OpenJobRequest;
  requestOpen: (job: Job) => void;
}

const CalculatorLinkContext = createContext<CalculatorLinkApi | null>(null);

/** Lets the Jobs list hand a saved job to the Springs screen, which may be on another tab. */
export function CalculatorLinkProvider({ children }: { children: ReactNode }) {
  const [openJob, setOpenJob] = useState<OpenJobRequest | undefined>();
  const requestOpen = useCallback((job: Job) => setOpenJob((prev) => ({ job, nonce: (prev?.nonce ?? 0) + 1 })), []);
  const api = useMemo(() => ({ openJob, requestOpen }), [openJob, requestOpen]);
  return <CalculatorLinkContext.Provider value={api}>{children}</CalculatorLinkContext.Provider>;
}

export function useCalculatorLink(): CalculatorLinkApi {
  const api = useContext(CalculatorLinkContext);
  if (!api) throw new Error('useCalculatorLink needs a CalculatorLinkProvider above it');
  return api;
}
