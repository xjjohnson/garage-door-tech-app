import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { mergeJobs, MergeResult } from './backup';
import { AcceptedQuote, cleanDetails, createJob, Job, JobDetails, JobInputs, JOBS_STORAGE_KEY, JobStatus, parseJobs } from './jobs';

interface JobsApi {
  jobs: Job[];
  loaded: boolean;
  add: (inputs: JobInputs, details: JobDetails, summary: { title: string; detail?: string }) => Job;
  /** Overwrites a saved job's inputs and answer with what's on the calculator now. */
  updateInputs: (id: string, inputs: JobInputs, summary: { title: string; detail?: string }) => void;
  updateDetails: (id: string, details: JobDetails) => void;
  setStatus: (id: string, status: JobStatus) => void;
  /** Records the option the customer picked, or clears it. */
  setAccepted: (id: string, accepted: AcceptedQuote | undefined) => void;
  remove: (id: string) => void;
  /** Adds a backup's jobs; when both have a job, the one changed last wins. Nothing is deleted. */
  restore: (incoming: Job[]) => MergeResult;
  /** Links jobs to customers (job id → customer id). Not counted as a change to the job. */
  linkCustomers: (links: Record<string, string>) => void;
  /** Copies a customer's new name and phone onto their jobs. */
  renameCustomer: (customerId: string, d: { customer: string; phone: string }) => void;
}

const JobsContext = createContext<JobsApi | null>(null);

/**
 * Holds the saved jobs for the whole app and writes every change to the
 * phone (AsyncStorage). No network. If storage fails the jobs still work
 * until the app is closed.
 */
export function JobsProvider({ children }: { children: ReactNode }) {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loaded, setLoaded] = useState(false);
  const touched = useRef(false);

  useEffect(() => {
    let alive = true;
    AsyncStorage.getItem(JOBS_STORAGE_KEY)
      .then((raw) => {
        if (!alive) return;
        const saved = parseJobs(raw);
        // A job saved while loading is kept along with the stored ones.
        setJobs((now) => (touched.current ? [...now, ...saved.filter((s) => !now.some((n) => n.id === s.id))] : saved));
      })
      .catch(() => undefined)
      .finally(() => {
        if (alive) setLoaded(true);
      });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!loaded && !touched.current) return;
    AsyncStorage.setItem(JOBS_STORAGE_KEY, JSON.stringify(jobs)).catch(() => undefined);
  }, [jobs, loaded]);

  const change = useCallback((fn: (prev: Job[]) => Job[]) => {
    touched.current = true;
    setJobs(fn);
  }, []);

  const add = useCallback<JobsApi['add']>(
    (inputs, details, summary) => {
      const job = createJob(inputs, details, summary, Date.now());
      change((prev) => [job, ...prev]);
      return job;
    },
    [change],
  );

  const updateInputs = useCallback<JobsApi['updateInputs']>(
    (id, inputs, summary) =>
      change((prev) =>
        prev.map((j) => (j.id === id ? ({ ...j, ...inputs, summaryTitle: summary.title, summaryDetail: summary.detail ?? '', updatedAt: Date.now() } as Job) : j)),
      ),
    [change],
  );

  const updateDetails = useCallback<JobsApi['updateDetails']>(
    (id, details) => change((prev) => prev.map((j) => (j.id === id ? { ...j, ...cleanDetails(details), updatedAt: Date.now() } : j))),
    [change],
  );

  const setStatus = useCallback<JobsApi['setStatus']>(
    (id, status) => change((prev) => prev.map((j) => (j.id === id ? { ...j, status, updatedAt: Date.now() } : j))),
    [change],
  );

  const setAccepted = useCallback<JobsApi['setAccepted']>(
    (id, accepted) =>
      change((prev) =>
        prev.map((j) => {
          if (j.id !== id) return j;
          const { accepted: _old, ...rest } = j;
          return (accepted ? { ...rest, accepted, updatedAt: Date.now() } : { ...rest, updatedAt: Date.now() }) as Job;
        }),
      ),
    [change],
  );

  const remove = useCallback<JobsApi['remove']>((id) => change((prev) => prev.filter((j) => j.id !== id)), [change]);

  const restore = useCallback<JobsApi['restore']>(
    (incoming) => {
      const result = mergeJobs(jobs, incoming);
      change((prev) => mergeJobs(prev, incoming).jobs);
      return result;
    },
    [jobs, change],
  );

  const linkCustomers = useCallback<JobsApi['linkCustomers']>(
    (links) => change((prev) => prev.map((j) => (links[j.id] && links[j.id] !== j.customerId ? { ...j, customerId: links[j.id] } : j))),
    [change],
  );

  const renameCustomer = useCallback<JobsApi['renameCustomer']>(
    (customerId, d) =>
      change((prev) =>
        prev.map((j) =>
          j.customerId === customerId && (j.customer !== d.customer || j.phone !== d.phone) ? { ...j, customer: d.customer, phone: d.phone, updatedAt: Date.now() } : j,
        ),
      ),
    [change],
  );

  const api = useMemo(
    () => ({ jobs, loaded, add, updateInputs, updateDetails, setStatus, setAccepted, remove, restore, linkCustomers, renameCustomer }),
    [jobs, loaded, add, updateInputs, updateDetails, setStatus, setAccepted, remove, restore, linkCustomers, renameCustomer],
  );
  return <JobsContext.Provider value={api}>{children}</JobsContext.Provider>;
}

export function useJobs(): JobsApi {
  const api = useContext(JobsContext);
  if (!api) throw new Error('useJobs needs a JobsProvider above it');
  return api;
}
