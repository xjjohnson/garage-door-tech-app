import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Attachments, ATTACHMENTS_STORAGE_KEY, EMPTY_ATTACHMENTS, JobPhoto, mergeSignatures, parseAttachments, PhotoKind, Signature } from './attachments';
import { DeviceMedia, deviceMedia } from './deviceMedia';

interface AttachmentsApi extends Attachments {
  loaded: boolean;
  /** The phone's camera and PDF maker; null where there are none (web). */
  media: DeviceMedia | null;
  addPhotos: (jobId: string, uris: string[], kind: PhotoKind, item?: string) => void;
  setPhotoKind: (id: string, kind: PhotoKind) => void;
  removePhoto: (id: string) => void;
  sign: (s: Omit<Signature, 'id' | 'at'>) => void;
  restoreSignatures: (s: Signature[]) => void;
}

const Ctx = createContext<AttachmentsApi | null>(null);
const newId = (p: string) => `${p}-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e9).toString(36)}`;

/** Job photos and customer signatures, saved on the phone. */
export function AttachmentsProvider({ children, media: given }: { children: ReactNode; media?: DeviceMedia | null }) {
  const media = useMemo(() => (given === undefined ? deviceMedia() : given), [given]);
  const [store, setStore] = useState<Attachments>(EMPTY_ATTACHMENTS);
  const [loaded, setLoaded] = useState(false);
  const touched = useRef(false);

  useEffect(() => {
    let alive = true;
    AsyncStorage.getItem(ATTACHMENTS_STORAGE_KEY)
      .then((raw) => {
        if (!alive || !raw) return;
        const saved = parseAttachments(raw);
        setStore((cur) => (touched.current ? { photos: [...saved.photos, ...cur.photos.filter((p) => !saved.photos.some((s) => s.id === p.id))], signatures: mergeSignatures(saved, cur.signatures).signatures } : saved));
      })
      .catch(() => undefined)
      .finally(() => alive && setLoaded(true));
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!loaded) return;
    AsyncStorage.setItem(ATTACHMENTS_STORAGE_KEY, JSON.stringify(store)).catch(() => undefined);
  }, [store, loaded]);

  const change = useCallback((fn: (s: Attachments) => Attachments) => {
    touched.current = true;
    setStore(fn);
  }, []);

  const addPhotos = useCallback(
    (jobId: string, uris: string[], kind: PhotoKind, item?: string) =>
      change((s) => ({ ...s, photos: [...s.photos, ...uris.map((uri, k): JobPhoto => ({ id: `${newId('ph')}-${k}`, jobId, uri, kind, at: Date.now() + k, ...(item ? { item } : {}) }))] })),
    [change],
  );
  const setPhotoKind = useCallback((id: string, kind: PhotoKind) => change((s) => ({ ...s, photos: s.photos.map((p) => (p.id === id ? { ...p, kind } : p)) })), [change]);
  const removePhoto = useCallback(
    (id: string) =>
      change((s) => {
        const p = s.photos.find((x) => x.id === id);
        if (p) media?.deletePhoto(p.uri);
        return { ...s, photos: s.photos.filter((x) => x.id !== id) };
      }),
    [change, media],
  );
  const sign = useCallback((sig: Omit<Signature, 'id' | 'at'>) => change((s) => ({ ...s, signatures: [...s.signatures, { ...sig, id: newId('sg'), at: Date.now() }] })), [change]);
  const restoreSignatures = useCallback((incoming: Signature[]) => change((s) => mergeSignatures(s, incoming)), [change]);

  const api = useMemo(
    () => ({ ...store, loaded, media, addPhotos, setPhotoKind, removePhoto, sign, restoreSignatures }),
    [store, loaded, media, addPhotos, setPhotoKind, removePhoto, sign, restoreSignatures],
  );
  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

export function useAttachments(): AttachmentsApi {
  const api = useContext(Ctx);
  if (!api) throw new Error('useAttachments needs an AttachmentsProvider above it');
  return api;
}
