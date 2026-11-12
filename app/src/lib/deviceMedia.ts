import { Platform } from 'react-native';

/** What screens need from the phone for photos and PDFs. Injected so tests can fake it. */
export interface DeviceMedia {
  /** Opens the camera; resolves to the saved photo's file, or null if they backed out or said no to the camera. */
  takePhoto(): Promise<string | null>;
  /** Picks photos from the gallery; resolves to the saved files. */
  pickPhotos(): Promise<string[]>;
  /** Removes a saved photo file. */
  deletePhoto(uri: string): void;
  /** Makes a PDF from HTML and opens the share sheet (text, email, Drive, print). */
  sharePdf(html: string, name: string): Promise<void>;
  /** Opens the share sheet for photo files. */
  sharePhoto(uri: string): Promise<void>;
  /** A saved photo as a data URL, to put in a PDF; null if it can't be read. */
  photoDataUrl?(uri: string): Promise<string | null>;
  /** Makes a PDF from HTML and returns it as base64, to send to Odoo. */
  pdfBase64?(html: string): Promise<string>;
  /** Copies a file (a voice note) into the app's own folder and returns the copy. */
  keepFile?(uri: string, folder: string): Promise<string>;
}

/**
 * The phone's camera, gallery, PDF maker and share sheet (expo-image-picker,
 * expo-print, expo-sharing, built into the APK from version 0.4.0). Photos are
 * copied into the app's own folder so they stay when the gallery is cleaned.
 * Null on the web build.
 */
export function deviceMedia(): DeviceMedia | null {
  if (Platform.OS === 'web') return null;
  let picker: typeof import('expo-image-picker');
  let print: typeof import('expo-print');
  let sharing: typeof import('expo-sharing');
  let fs: typeof import('expo-file-system');
  try {
    picker = require('expo-image-picker');
    print = require('expo-print');
    sharing = require('expo-sharing');
    fs = require('expo-file-system');
  } catch {
    return null;
  }
  const keep = async (uri: string): Promise<string> => {
    const dir = new fs.Directory(fs.Paths.document, 'photos');
    if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
    const ext = (uri.split('?')[0].match(/\.(jpe?g|png|heic|webp)$/i)?.[1] ?? 'jpg').toLowerCase();
    const dest = new fs.File(dir, `p-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}.${ext}`);
    await new fs.File(uri).copy(dest);
    return dest.uri;
  };
  return {
    async takePhoto() {
      const perm = await picker.requestCameraPermissionsAsync();
      if (!perm.granted) return null;
      const r = await picker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.6 });
      if (r.canceled || !r.assets?.[0]) return null;
      return keep(r.assets[0].uri);
    },
    async pickPhotos() {
      const r = await picker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.6, allowsMultipleSelection: true, selectionLimit: 10 });
      if (r.canceled) return [];
      const out: string[] = [];
      for (const a of r.assets ?? []) out.push(await keep(a.uri));
      return out;
    },
    deletePhoto(uri) {
      try {
        const f = new fs.File(uri);
        if (f.exists) f.delete();
      } catch {
        // Already gone.
      }
    },
    async sharePdf(html, name) {
      const { uri } = await print.printToFileAsync({ html });
      let shareUri = uri;
      try {
        // Give the file a readable name for the customer.
        const named = new fs.File(fs.Paths.cache, name);
        if (named.exists) named.delete();
        await new fs.File(uri).copy(named);
        shareUri = named.uri;
      } catch {
        // Keep the generated name.
      }
      await sharing.shareAsync(shareUri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf', dialogTitle: name });
    },
    async sharePhoto(uri) {
      await sharing.shareAsync(uri, { mimeType: 'image/jpeg' });
    },
    async photoDataUrl(uri) {
      try {
        const ext = (uri.split('?')[0].match(/\.(png|webp)$/i)?.[1] ?? 'jpeg').toLowerCase();
        return `data:image/${ext};base64,${await new fs.File(uri).base64()}`;
      } catch {
        return null;
      }
    },
    async pdfBase64(html) {
      const { uri } = await print.printToFileAsync({ html });
      const f = new fs.File(uri);
      const b = await f.base64();
      try {
        f.delete();
      } catch {
        // Cache, cleaned up by the phone anyway.
      }
      return b;
    },
    async keepFile(uri, folder) {
      const dir = new fs.Directory(fs.Paths.document, folder);
      if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
      const ext = uri.split('?')[0].match(/\.([a-z0-9]{2,4})$/i)?.[1] ?? 'm4a';
      const dest = new fs.File(dir, `${folder[0]}-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}.${ext}`);
      await new fs.File(uri).copy(dest);
      return dest.uri;
    },
  };
}
