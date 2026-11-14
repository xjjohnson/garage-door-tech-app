/**
 * Notes on a record in Odoo (a job, a customer, a house), read from and posted
 * to its chatter. A note can carry photos and voice notes, which go to Odoo as
 * attachments on the same record and ride on the same message. Notes written
 * without a signal wait in an outbox on the phone, like photos do. Notes are
 * internal only: Odoo never emails them to the customer. Kept free of React.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { OdooClient } from './odoo';

export type NoteModel = 'fsm.order' | 'project.task' | 'res.partner' | 'fsm.location';
export interface NoteTarget {
  model: NoteModel;
  id: number;
}
export const noteKey = (t: NoteTarget) => `${t.model}:${t.id}`;

export interface NoteVoice {
  uri: string;
  seconds: number;
  at: number;
}

/** A note written on the phone that hasn't reached Odoo yet. */
export interface PendingNote {
  id: string;
  target: NoteTarget;
  body: string;
  photos: string[];
  voice: NoteVoice[];
  at: number;
}

/** A note or message as the page shows it. */
export interface NoteRow {
  id: number;
  at: number;
  who: string;
  body: string;
  /** File names of what's attached. */
  files: string[];
}

export const NOTES_OUTBOX_KEY = 'notes-outbox/v1';
export const NOTES_CACHE_KEY = 'notes-cache/v1';

const two = (n: number) => String(n).padStart(2, '0');
const MIME: Record<string, string> = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', heic: 'image/heic', m4a: 'audio/mp4', mp4: 'audio/mp4', aac: 'audio/aac', mp3: 'audio/mpeg', wav: 'audio/wav', '3gp': 'audio/3gpp', caf: 'audio/x-caf', webm: 'audio/webm' };
const extOf = (uri: string, fallback: string) => (uri.split('?')[0].match(/\.([a-z0-9]{2,4})$/i)?.[1] ?? fallback).toLowerCase();

export function noteFileName(kind: 'Photo' | 'Voice note', at: number, uri: string): string {
  const d = new Date(at);
  return `${kind} ${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())} ${two(d.getHours())}.${two(d.getMinutes())}.${extOf(uri, kind === 'Photo' ? 'jpg' : 'm4a')}`;
}

/** Odoo's HTML as plain text: tags gone, line breaks kept, common entities decoded. */
export function plainText(html: unknown): string {
  if (typeof html !== 'string') return '';
  return html
    .replace(/<\s*br\s*\/?>/gi, '\n')
    .replace(/<\/\s*(p|div|li|h[1-6])\s*>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Odoo's "2026-11-14 16:02:11" (UTC) as a time. */
export function odooTime(v: unknown): number {
  const m = typeof v === 'string' ? v.match(/^(\d{4})-(\d\d)-(\d\d)[ T](\d\d):(\d\d):(\d\d)/) : null;
  return m ? Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]) : 0;
}

/** Notes and messages on a record, newest first. Tracking noise (stage changes) is left out. */
export async function fetchNotes(client: Pick<OdooClient, 'call'>, target: NoteTarget, limit = 50): Promise<NoteRow[]> {
  const rows = (await client.call('mail.message', 'search_read', [[['model', '=', target.model], ['res_id', '=', target.id], ['message_type', 'in', ['comment', 'email']]]], { fields: ['date', 'author_id', 'body', 'attachment_ids'], order: 'date desc, id desc', limit })) as Record<string, unknown>[];
  const ids = [...new Set(rows.flatMap((r) => (Array.isArray(r.attachment_ids) ? (r.attachment_ids as number[]) : [])))];
  const names = new Map<number, string>();
  if (ids.length) {
    const files = (await client.call('ir.attachment', 'read', [ids], { fields: ['name'] }).catch(() => [])) as { id: number; name?: unknown }[];
    for (const f of files) names.set(f.id, typeof f.name === 'string' ? f.name : 'File');
  }
  return rows.map((r) => ({
    id: r.id as number,
    at: odooTime(r.date),
    who: Array.isArray(r.author_id) && typeof r.author_id[1] === 'string' ? r.author_id[1] : 'Odoo',
    body: plainText(r.body),
    files: (Array.isArray(r.attachment_ids) ? (r.attachment_ids as number[]) : []).map((i) => names.get(i) ?? 'File'),
  }));
}

/** Posts one note (and its photos and voice notes) to the record as an internal note. */
export async function postNote(
  client: Pick<OdooClient, 'call'>,
  note: Pick<PendingNote, 'target' | 'body' | 'photos' | 'voice' | 'at'>,
  readFile: (uri: string) => Promise<string | null>,
): Promise<void> {
  const attachments: number[] = [];
  const add = async (kind: 'Photo' | 'Voice note', uri: string, at: number) => {
    const raw = await readFile(uri);
    if (!raw) throw new Error('A file for this note is missing from the phone.');
    const name = noteFileName(kind, at, uri);
    const mimetype = MIME[extOf(uri, kind === 'Photo' ? 'jpg' : 'm4a')] ?? (kind === 'Photo' ? 'image/jpeg' : 'audio/mp4');
    attachments.push((await client.call('ir.attachment', 'create', [{ name, type: 'binary', datas: raw.replace(/^data:[^,]*,/, ''), res_model: note.target.model, res_id: note.target.id, mimetype }])) as number);
  };
  for (const [i, p] of note.photos.entries()) await add('Photo', p, note.at + i);
  for (const v of note.voice) await add('Voice note', v.uri, v.at);
  const body = note.body.trim() || (note.voice.length && !note.photos.length ? 'Voice note from the app' : note.photos.length && !note.voice.length ? 'Photo from the app' : 'Note from the app');
  // Plain text: Odoo shows HTML sent through message_post as literal tags.
  await client.call(note.target.model, 'message_post', [[note.target.id]], { body, ...(attachments.length ? { attachment_ids: attachments } : {}), message_type: 'comment', subtype_xmlid: 'mail.mt_note' });
}

/** The house (Field Service location) a job is at, or null. */
export async function houseOf(client: Pick<OdooClient, 'call'>, job: { model: 'fsm.order' | 'project.task'; id: number }): Promise<NoteTarget | null> {
  if (job.model !== 'fsm.order') return null;
  const [r] = (await client.call('fsm.order', 'read', [[job.id]], { fields: ['location_id'] })) as { location_id?: unknown }[];
  return Array.isArray(r?.location_id) && typeof r.location_id[0] === 'number' ? { model: 'fsm.location', id: r.location_id[0] } : null;
}

export function parseOutbox(raw: string | null): PendingNote[] {
  try {
    const d = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(d)) return [];
    return d.flatMap((x): PendingNote[] => {
      const n = (x ?? {}) as Record<string, any>;
      const models: NoteModel[] = ['fsm.order', 'project.task', 'res.partner', 'fsm.location'];
      if (typeof n.id !== 'string' || !n.target || !models.includes(n.target.model) || typeof n.target.id !== 'number') return [];
      return [
        {
          id: n.id,
          target: { model: n.target.model, id: n.target.id },
          body: typeof n.body === 'string' ? n.body : '',
          photos: Array.isArray(n.photos) ? n.photos.filter((p: unknown): p is string => typeof p === 'string') : [],
          voice: Array.isArray(n.voice) ? n.voice.flatMap((v: any) => (v && typeof v.uri === 'string' ? [{ uri: v.uri, seconds: Number(v.seconds) || 0, at: Number(v.at) || 0 }] : [])) : [],
          at: Number(n.at) || 0,
        },
      ];
    });
  } catch {
    return [];
  }
}

const listeners = new Set<() => void>();
const changed = () => listeners.forEach((f) => f());
/** Runs `fn` whenever the outbox changes; returns the unsubscribe. */
export const onOutboxChange = (fn: () => void) => (listeners.add(fn), () => void listeners.delete(fn));

export async function readOutbox(): Promise<PendingNote[]> {
  return parseOutbox(await AsyncStorage.getItem(NOTES_OUTBOX_KEY).catch(() => null));
}

/** Puts a note in the outbox; the background sync sends it. */
export async function queueNote(n: Omit<PendingNote, 'id' | 'at'>, now = Date.now()): Promise<PendingNote> {
  const note: PendingNote = { ...n, id: `n${now.toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`, at: now };
  await AsyncStorage.setItem(NOTES_OUTBOX_KEY, JSON.stringify([...(await readOutbox()), note]));
  changed();
  return note;
}

export async function dropFromOutbox(id: string): Promise<void> {
  await AsyncStorage.setItem(NOTES_OUTBOX_KEY, JSON.stringify((await readOutbox()).filter((n) => n.id !== id)));
  changed();
}

/** Sends every waiting note, oldest first; stops at the first failure so order is kept. Returns how many went. */
export async function sendOutbox(client: Pick<OdooClient, 'call'>, readFile: (uri: string) => Promise<string | null>, onError?: (e: unknown) => void): Promise<number> {
  let sent = 0;
  for (const n of (await readOutbox()).sort((a, b) => a.at - b.at)) {
    try {
      await postNote(client, n, readFile);
      await dropFromOutbox(n.id);
      sent++;
    } catch (e) {
      onError?.(e);
      break;
    }
  }
  return sent;
}

export async function readCachedNotes(target: NoteTarget): Promise<NoteRow[] | null> {
  try {
    const all = JSON.parse((await AsyncStorage.getItem(NOTES_CACHE_KEY)) ?? '{}') as Record<string, NoteRow[]>;
    return Array.isArray(all[noteKey(target)]) ? all[noteKey(target)] : null;
  } catch {
    return null;
  }
}

export async function cacheNotes(target: NoteTarget, rows: NoteRow[]): Promise<void> {
  try {
    const all = JSON.parse((await AsyncStorage.getItem(NOTES_CACHE_KEY)) ?? '{}') as Record<string, NoteRow[]>;
    all[noteKey(target)] = rows.slice(0, 50);
    // Keep only the most recently read records so the cache stays small.
    const keys = Object.keys(all);
    for (const k of keys.slice(0, Math.max(0, keys.length - 40))) delete all[k];
    await AsyncStorage.setItem(NOTES_CACHE_KEY, JSON.stringify(all));
  } catch {
    // The cache is a nicety.
  }
}
