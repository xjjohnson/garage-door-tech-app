import { Platform } from 'react-native';

/** What the Manuals screen needs from the phone's storage to keep starred PDFs. */
export interface ManualFiles {
  /**
   * Downloads a document and keeps it on the phone. Resolves to the saved
   * file's address. Rejects with NotPdfError when the link turned out to be
   * a web page rather than a PDF (nothing is kept then), or with any other
   * error when there's no signal or the maker's site refused.
   */
  save(url: string): Promise<string>;
  /** Whether a saved file is still there (the phone can clear app storage). */
  has(uri: string): boolean;
  remove(uri: string): void;
  /** Opens a saved PDF in the phone's PDF viewer. */
  open(uri: string, title: string): Promise<void>;
}

export class NotPdfError extends Error {
  constructor(url: string) {
    super(`Not a PDF: ${url}`);
    this.name = 'NotPdfError';
  }
}

/** Every PDF starts with these bytes, whatever the link's address looks like. */
const PDF_MAGIC = [0x25, 0x50, 0x44, 0x46, 0x2d]; // "%PDF-"

export function looksLikePdf(head: ArrayLike<number>): boolean {
  return PDF_MAGIC.every((b, i) => head[i] === b);
}

/** A file name from the link, so the same document always lands in the same file. */
export function fileNameFor(url: string): string {
  let h = 0;
  for (let i = 0; i < url.length; i++) h = (Math.imul(31, h) + url.charCodeAt(i)) | 0;
  const tail = url
    .replace(/^https?:\/\//, '')
    .replace(/\?.*$/, '')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .slice(-60);
  return `${tail}_${(h >>> 0).toString(36)}.pdf`;
}

/**
 * The phone's storage, through expo-file-system. Null on the web build and
 * in tests, where there's no file system to save to; the screen then simply
 * doesn't offer saving.
 */
export function deviceManualFiles(): ManualFiles | null {
  if (Platform.OS === 'web') return null;
  let fs: typeof import('expo-file-system');
  try {
    fs = require('expo-file-system');
  } catch {
    return null;
  }
  const { Directory, File, FileMode, Paths } = fs;
  const dir = () => {
    const d = new Directory(Paths.document, 'manuals');
    if (!d.exists) d.create({ intermediates: true, idempotent: true });
    return d;
  };
  return {
    async save(url) {
      const file = new File(dir(), fileNameFor(url));
      const saved = await File.downloadFileAsync(url, file, { idempotent: true });
      let pdf = false;
      try {
        const handle = saved.open(FileMode.ReadOnly);
        try {
          pdf = looksLikePdf(handle.readBytesSync(PDF_MAGIC.length));
        } finally {
          handle.close();
        }
      } catch {
        pdf = false;
      }
      if (!pdf) {
        if (saved.exists) saved.delete();
        throw new NotPdfError(url);
      }
      return saved.uri;
    },
    has(uri) {
      try {
        return new File(uri).exists;
      } catch {
        return false;
      }
    },
    remove(uri) {
      try {
        const f = new File(uri);
        if (f.exists) f.delete();
      } catch {
        // Already gone.
      }
    },
    async open(uri, title) {
      await new File(uri).preview({ mimeType: 'application/pdf', title });
    },
  };
}
