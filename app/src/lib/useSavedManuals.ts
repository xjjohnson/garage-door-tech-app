import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useRef, useState } from 'react';
import { MANUAL_LINKS, ManualLink } from '../data/manuals';
import { ManualFiles, NotPdfError } from './manualFiles';

export const SAVED_MANUALS_KEY = 'manuals.saved.v1';

/** What's kept between visits: the starred entries, and where each saved PDF is. */
interface Stored {
  starred: string[];
  /** Document address → the saved file's address on the phone. */
  files: Record<string, string>;
}

/**
 * A document of a starred entry that isn't saved: still downloading, failed
 * (usually no signal; it's tried again next time), or a web page that can't
 * be saved.
 */
export type DocState = 'saving' | 'failed' | 'web';

const EMPTY: Stored = { starred: [], files: {} };

function parse(raw: string | null): Stored {
  if (!raw) return EMPTY;
  try {
    const v = JSON.parse(raw);
    const starred = Array.isArray(v?.starred) ? v.starred.filter((s: unknown) => typeof s === 'string') : [];
    const files: Record<string, string> = {};
    if (v?.files && typeof v.files === 'object') for (const [k, f] of Object.entries(v.files)) if (typeof f === 'string') files[k] = f;
    return { starred, files };
  } catch {
    return EMPTY;
  }
}

const linkById = (id: string) => MANUAL_LINKS.find((l) => l.id === id);

/**
 * Starred manuals, with their PDFs saved on the phone so they open with no
 * signal. Starring saves an entry's documents; unstarring deletes them.
 * Anything that couldn't be saved is tried again each time the screen opens
 * and whenever the tech taps Try again.
 */
export function useSavedManuals(files: ManualFiles | null) {
  const [store, setStore] = useState<Stored>(EMPTY);
  const [states, setStates] = useState<Record<string, DocState>>({});
  // The latest store, for the download loop that runs across renders.
  const latest = useRef(store);
  latest.current = store;

  const write = useCallback((next: Stored) => {
    latest.current = next;
    setStore(next);
    AsyncStorage.setItem(SAVED_MANUALS_KEY, JSON.stringify(next)).catch(() => {});
  }, []);

  const setState = (url: string, s: DocState | null) =>
    setStates((prev) => {
      const next = { ...prev };
      if (s) next[url] = s;
      else delete next[url];
      return next;
    });

  /** Saves the documents of a starred entry that aren't on the phone yet, one at a time. */
  const saveDocs = useCallback(
    async (link: ManualLink) => {
      if (!files) return;
      for (const doc of link.docs ?? []) {
        if (!latest.current.starred.includes(link.id) || latest.current.files[doc.url]) continue;
        setState(doc.url, 'saving');
        try {
          const uri = await files.save(doc.url);
          // Unstarred while it was downloading: don't keep it.
          if (!latest.current.starred.includes(link.id)) {
            files.remove(uri);
            setState(doc.url, null);
            continue;
          }
          write({ ...latest.current, files: { ...latest.current.files, [doc.url]: uri } });
          setState(doc.url, null);
        } catch (e) {
          setState(doc.url, e instanceof NotPdfError ? 'web' : 'failed');
        }
      }
    },
    [files, write],
  );

  useEffect(() => {
    let live = true;
    AsyncStorage.getItem(SAVED_MANUALS_KEY)
      .catch(() => null)
      .then((raw) => {
        if (!live) return;
        const s = parse(raw);
        // The phone can clear app storage; forget files that are gone so they download again.
        const kept: Record<string, string> = {};
        for (const [url, uri] of Object.entries(s.files)) if (files?.has(uri)) kept[url] = uri;
        // Keep anything starred in the moment before the saved list came back.
        const cur = latest.current;
        write({ starred: [...new Set([...s.starred, ...cur.starred])], files: { ...kept, ...cur.files } });
        for (const id of s.starred) {
          const link = linkById(id);
          if (link) void saveDocs(link);
        }
      });
    return () => {
      live = false;
    };
  }, [files, saveDocs, write]);

  const toggleStar = useCallback(
    (link: ManualLink) => {
      const cur = latest.current;
      if (cur.starred.includes(link.id)) {
        const nextFiles = { ...cur.files };
        for (const doc of link.docs ?? []) {
          const uri = nextFiles[doc.url];
          // Another starred entry can list the same document; keep it for that one.
          const shared = cur.starred.some((id) => id !== link.id && linkById(id)?.docs?.some((d) => d.url === doc.url));
          if (uri && !shared) {
            files?.remove(uri);
            delete nextFiles[doc.url];
          }
          setState(doc.url, null);
        }
        write({ starred: cur.starred.filter((id) => id !== link.id), files: nextFiles });
      } else {
        write({ ...cur, starred: [...cur.starred, link.id] });
        void saveDocs(link);
      }
    },
    [files, saveDocs, write],
  );

  return {
    /** False on the web build: starring still works, but nothing is saved. */
    canSave: files !== null,
    starred: store.starred,
    isStarred: (id: string) => store.starred.includes(id),
    savedUri: (url: string): string | undefined => store.files[url],
    docState: (url: string): DocState | undefined => states[url],
    toggleStar,
    retry: (link: ManualLink) => void saveDocs(link),
  };
}
